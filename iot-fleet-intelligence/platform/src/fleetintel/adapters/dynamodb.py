"""DynamoDB single-table adapters.

Access patterns (see docs/adr/0003-dynamodb-single-table.md):

| # | Pattern                                   | Key condition                                   |
|---|-------------------------------------------|-------------------------------------------------|
| 1 | Incident bundle (meta+enrichment+diag)    | Query  PK = INC#<id>                            |
| 2 | Tenant incidents, newest first            | Query  GSI1 PK = TENANT#<t>, SK desc            |
| 3 | Tenant incidents by status                | Query  GSI2 PK = TENANT#<t>#STATUS#<s>, SK desc |
| 4 | Detector state per stream shard           | GetItem PK = DETSTATE#<topic>#<partition>       |
| 5 | Enrichment cache entry                    | GetItem PK = CACHE#<provider>#<key> (TTL)       |
| 6 | Idempotency records (Powertools)          | GetItem PK = idempotency#<fn>, SK = <hash>      |
"""

from __future__ import annotations

import base64
import json
import time
import zlib
from typing import TYPE_CHECKING, Any

from botocore.exceptions import ClientError

from fleetintel.domain import (
    DiagnosisRecord,
    EnrichmentContext,
    Incident,
    IncidentStatus,
)
from fleetintel.ports import StaleStateError, StoredState

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.client import DynamoDBClient

MAX_STATE_BYTES = 350_000  # stay well below the 400 KB item limit


def _ccf(exc: ClientError) -> bool:
    return exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException"


class DynamoIncidentRepository:
    def __init__(self, client: DynamoDBClient, table: str) -> None:
        self.c = client
        self.table = table

    def upsert_incident(self, incident: Incident) -> bool:
        data = incident.model_dump_json(exclude={"status"})
        opened = incident.opened_at.isoformat()
        try:
            self.c.put_item(
                TableName=self.table,
                Item={
                    "PK": {"S": f"INC#{incident.incident_id}"},
                    "SK": {"S": "META"},
                    "GSI1PK": {"S": f"TENANT#{incident.tenant}"},
                    "GSI1SK": {"S": f"{opened}#{incident.incident_id}"},
                    "GSI2PK": {"S": f"TENANT#{incident.tenant}#STATUS#{incident.status.value}"},
                    "GSI2SK": {"S": f"{opened}#{incident.incident_id}"},
                    "status": {"S": incident.status.value},
                    "last_seen_at": {"S": incident.last_seen_at.isoformat()},
                    "data": {"S": data},
                },
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as exc:
            if not _ccf(exc):
                raise
        else:
            return True
        try:
            # Extend the episode; never move last_seen_at backwards, never touch status.
            self.c.update_item(
                TableName=self.table,
                Key={"PK": {"S": f"INC#{incident.incident_id}"}, "SK": {"S": "META"}},
                UpdateExpression="SET #d = :d, last_seen_at = :ls",
                ConditionExpression="attribute_exists(PK) AND last_seen_at < :ls",
                ExpressionAttributeNames={"#d": "data"},
                ExpressionAttributeValues={
                    ":d": {"S": data},
                    ":ls": {"S": incident.last_seen_at.isoformat()},
                },
            )
        except ClientError as exc:
            if not _ccf(exc):
                raise
        return False

    @staticmethod
    def _incident(item: dict[str, Any]) -> Incident:
        inc = Incident.model_validate_json(item["data"]["S"])
        return inc.model_copy(update={"status": IncidentStatus(item["status"]["S"])})

    def get_bundle(
        self, incident_id: str
    ) -> tuple[Incident | None, EnrichmentContext | None, list[DiagnosisRecord]]:
        resp = self.c.query(
            TableName=self.table,
            KeyConditionExpression="PK = :pk",
            ExpressionAttributeValues={":pk": {"S": f"INC#{incident_id}"}},
            ConsistentRead=True,
        )
        incident: Incident | None = None
        enrichment: EnrichmentContext | None = None
        diagnoses: list[DiagnosisRecord] = []
        for item in resp.get("Items", []):
            sk = item["SK"]["S"]
            if sk == "META":
                incident = self._incident(item)
            elif sk == "ENRICH":
                enrichment = EnrichmentContext.model_validate_json(item["data"]["S"])
            elif sk.startswith("DIAG#"):
                diagnoses.append(DiagnosisRecord.model_validate_json(item["data"]["S"]))
        return incident, enrichment, diagnoses

    def list_incidents(
        self, tenant: str, status: IncidentStatus | None, limit: int, cursor: str | None
    ) -> tuple[list[Incident], str | None]:
        if status is None:
            index, pk = "GSI1", f"TENANT#{tenant}"
        else:
            index, pk = "GSI2", f"TENANT#{tenant}#STATUS#{status.value}"
        kwargs: dict[str, Any] = {
            "TableName": self.table,
            "IndexName": index,
            "KeyConditionExpression": f"{index}PK = :pk",
            "ExpressionAttributeValues": {":pk": {"S": pk}},
            "ScanIndexForward": False,
            "Limit": limit,
        }
        if cursor:
            try:
                start_key = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            except (ValueError, json.JSONDecodeError) as exc:
                raise ValueError("invalid cursor") from exc
            # The cursor must belong to this tenant/index: never let a client pivot partitions.
            if start_key.get(f"{index}PK", {}).get("S") != pk:
                raise ValueError("invalid cursor")
            kwargs["ExclusiveStartKey"] = start_key
        resp = self.c.query(**kwargs)
        items = [self._incident(i) for i in resp.get("Items", [])]
        lek = resp.get("LastEvaluatedKey")
        nxt = base64.urlsafe_b64encode(json.dumps(lek).encode()).decode() if lek else None
        return items, nxt

    def set_status(
        self, incident_id: str, status: IncidentStatus, expected: set[IncidentStatus] | None = None
    ) -> bool:
        inc, _, _ = self.get_bundle(incident_id)
        if inc is None:
            return False
        values: dict[str, Any] = {
            ":s": {"S": status.value},
            ":g": {"S": f"TENANT#{inc.tenant}#STATUS#{status.value}"},
        }
        condition = "attribute_exists(PK)"
        if expected:
            names = []
            for n, st in enumerate(sorted(expected)):
                values[f":e{n}"] = {"S": st.value}
                names.append(f":e{n}")
            condition += f" AND #st IN ({', '.join(names)})"
        try:
            self.c.update_item(
                TableName=self.table,
                Key={"PK": {"S": f"INC#{incident_id}"}, "SK": {"S": "META"}},
                UpdateExpression="SET #st = :s, GSI2PK = :g",
                ConditionExpression=condition,
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues=values,
            )
        except ClientError as exc:
            if _ccf(exc):
                return False
            raise
        return True

    def save_enrichment(self, ctx: EnrichmentContext) -> None:
        self.c.put_item(
            TableName=self.table,
            Item={
                "PK": {"S": f"INC#{ctx.incident_id}"},
                "SK": {"S": "ENRICH"},
                "data": {"S": ctx.model_dump_json()},
            },
        )

    def save_diagnosis(self, record: DiagnosisRecord) -> None:
        self.c.put_item(
            TableName=self.table,
            Item={
                "PK": {"S": f"INC#{record.incident_id}"},
                "SK": {"S": f"DIAG#{record.created_at.isoformat()}"},
                "data": {"S": record.model_dump_json()},
            },
        )

    def ping(self) -> bool:
        try:
            self.c.describe_table(TableName=self.table)
        except ClientError:
            return False
        return True


class DynamoStateStore:
    """Detector state per Kafka partition, zlib-compressed, with optimistic locking."""

    def __init__(self, client: DynamoDBClient, table: str) -> None:
        self.c = client
        self.table = table

    def load(self, shard: str) -> StoredState:
        resp = self.c.get_item(
            TableName=self.table,
            Key={"PK": {"S": f"DETSTATE#{shard}"}, "SK": {"S": "STATE"}},
            ConsistentRead=True,
        )
        item = resp.get("Item")
        if not item:
            return StoredState(state=None, version=0, last_offset=-1)
        state = json.loads(zlib.decompress(item["blob"]["B"]))
        return StoredState(
            state=state,
            version=int(item["version"]["N"]),
            last_offset=int(item["last_offset"]["N"]),
        )

    def save(
        self, shard: str, state: dict[str, Any], last_offset: int, expected_version: int
    ) -> None:
        blob = zlib.compress(json.dumps(state, separators=(",", ":")).encode(), level=6)
        if len(blob) > MAX_STATE_BYTES:
            raise ValueError(
                f"detector state for {shard} is {len(blob)} bytes; add partitions or shorten windows"
            )
        try:
            self.c.put_item(
                TableName=self.table,
                Item={
                    "PK": {"S": f"DETSTATE#{shard}"},
                    "SK": {"S": "STATE"},
                    "blob": {"B": blob},
                    "version": {"N": str(expected_version + 1)},
                    "last_offset": {"N": str(last_offset)},
                    "updated_at": {"N": str(int(time.time()))},
                },
                ConditionExpression="attribute_not_exists(PK) OR version = :v",
                ExpressionAttributeValues={":v": {"N": str(expected_version)}},
            )
        except ClientError as exc:
            if _ccf(exc):
                raise StaleStateError(shard) from exc
            raise


class DynamoCache:
    def __init__(self, client: DynamoDBClient, table: str, clock: Any = time.time) -> None:
        self.c = client
        self.table = table
        self._clock = clock

    def get(self, key: str) -> dict[str, Any] | None:
        resp = self.c.get_item(
            TableName=self.table, Key={"PK": {"S": f"CACHE#{key}"}, "SK": {"S": "V"}}
        )
        item = resp.get("Item")
        # TTL deletion is lazy (up to days), so expiry is enforced on read too.
        if not item or int(item["ttl"]["N"]) < self._clock():
            return None
        value: dict[str, Any] = json.loads(item["data"]["S"])
        return value

    def put(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        self.c.put_item(
            TableName=self.table,
            Item={
                "PK": {"S": f"CACHE#{key}"},
                "SK": {"S": "V"},
                "data": {"S": json.dumps(value, default=str)},
                "ttl": {"N": str(int(self._clock()) + ttl_seconds)},
            },
        )


def create_table(client: DynamoDBClient, table: str) -> None:
    """Create the single table (local runs/tests; Terraform owns it in AWS)."""
    try:
        client.create_table(
            TableName=table,
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[
                {"AttributeName": n, "AttributeType": "S"}
                for n in ("PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK")
            ],
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": g,
                    "KeySchema": [
                        {"AttributeName": f"{g}PK", "KeyType": "HASH"},
                        {"AttributeName": f"{g}SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
                for g in ("GSI1", "GSI2")
            ],
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "ResourceInUseException":
            raise
