"""Where tables live: path-based Delta locally, Unity Catalog tables on Databricks.

Tables(root="/lake")                       -> delta.`/lake/silver/events`
Tables(catalog="main", schema="shop")      -> main.shop.silver_events
"""

from __future__ import annotations

from dataclasses import dataclass

from pyspark.sql import DataFrame, SparkSession


@dataclass(frozen=True)
class Tables:
    root: str | None = None
    catalog: str | None = None
    schema: str | None = None

    def __post_init__(self):
        if bool(self.root) == bool(self.catalog and self.schema):
            raise ValueError("pass either root (path-based) or catalog+schema (Unity Catalog)")

    def ref(self, layer: str, name: str) -> str:
        if self.root:
            return f"delta.`{self.root.rstrip('/')}/{layer}/{name}`"
        return f"{self.catalog}.{self.schema}.{layer}_{name}"

    def path(self, layer: str, name: str) -> str | None:
        return f"{self.root.rstrip('/')}/{layer}/{name}" if self.root else None

    def landing(self, dataset: str, batch_date: str) -> str:
        base = self.root.rstrip("/") if self.root else f"/Volumes/{self.catalog}/{self.schema}/landing"
        return f"{base}/landing/{dataset}/date={batch_date}"

    def exists(self, spark: SparkSession, layer: str, name: str) -> bool:
        if self.root:
            from delta.tables import DeltaTable

            return DeltaTable.isDeltaTable(spark, self.path(layer, name))
        return spark.catalog.tableExists(self.ref(layer, name))

    def read(self, spark: SparkSession, layer: str, name: str) -> DataFrame:
        return spark.read.table(self.ref(layer, name))

    def overwrite_partition(
        self, df: DataFrame, layer: str, name: str, predicate: str, partition_by: list[str]
    ) -> None:
        """Atomically replace only the rows matching `predicate` (Delta replaceWhere)."""
        writer = (
            df.write.format("delta")
            .mode("overwrite")
            .option("replaceWhere", predicate)
            .partitionBy(*partition_by)
        )
        if self.root:
            writer.save(self.path(layer, name))
        else:
            writer.saveAsTable(self.ref(layer, name))

    def create(self, df: DataFrame, layer: str, name: str, partition_by: list[str]) -> None:
        writer = df.write.format("delta").mode("errorifexists").partitionBy(*partition_by)
        if self.root:
            writer.save(self.path(layer, name))
        else:
            writer.saveAsTable(self.ref(layer, name))
