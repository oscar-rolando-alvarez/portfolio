"""Provider-agnostic LLM adapters.

``OpenAICompatibleChat`` speaks the de-facto standard ``/chat/completions``
and ``/embeddings`` HTTP API, so the same code works with OpenAI, Azure
OpenAI (via its v1-compatible endpoint), vLLM, Ollama, LiteLLM and others.
``FakeDiagnosisModel`` is a deterministic stand-in used by CI and evals.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from fleetintel.ports import ChatResult
from fleetintel.resilience import RetryPolicy

EVIDENCE_RE = re.compile(r"<evidence>\s*(\{.*?\})\s*</evidence>", re.DOTALL)
RUNBOOKS_RE = re.compile(r"\[(RB-[A-Z]+-\d{3})#")


class LLMError(RuntimeError):
    pass


class OpenAICompatibleChat:
    provider = "openai_compatible"

    def __init__(
        self,
        client: httpx.Client,
        base_url: str,
        api_key: str,
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 800,
        retry: RetryPolicy | None = None,
    ) -> None:
        self.client = client
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.retry = retry or RetryPolicy(attempts=3, base_delay=0.5, max_delay=4.0)

    def _post(self, payload: dict[str, Any]) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        return self.client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)

    def complete_json(
        self, system: str, user: str, schema: dict[str, Any], schema_name: str
    ) -> ChatResult:
        payload: dict[str, Any] = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": schema, "strict": False},
            },
        }

        def call() -> httpx.Response:
            resp = self._post(payload)
            if resp.status_code == 400 and "response_format" in resp.text:
                # Server without json_schema support: fall back to JSON mode;
                # the schema is already embedded in the prompt and validated after.
                payload["response_format"] = {"type": "json_object"}
                resp = self._post(payload)
            resp.raise_for_status()
            return resp

        body = self.retry.run(call).json()
        try:
            choice = body["choices"][0]
            content = choice["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"malformed completion response: {str(body)[:200]}") from exc
        usage = body.get("usage") or {}
        return ChatResult(
            content=content,
            model=str(body.get("model", self.model)),
            input_tokens=int(usage.get("prompt_tokens", 0)),
            output_tokens=int(usage.get("completion_tokens", 0)),
            finish_reason=str(choice.get("finish_reason", "stop")),
        )


class OpenAICompatibleEmbeddings:
    def __init__(self, client: httpx.Client, base_url: str, api_key: str, model: str) -> None:
        self.client = client
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.name = f"openai_compatible:{model}"

    def embed(self, texts: list[str]) -> list[list[float]]:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        resp = self.client.post(
            f"{self.base_url}/embeddings",
            json={"model": self.model, "input": texts},
            headers=headers,
        )
        resp.raise_for_status()
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        return [list(map(float, d["embedding"])) for d in data]


# ---------------------------------------------------------------------------
# Deterministic fake model
# ---------------------------------------------------------------------------

_REMEDIATION: dict[str, list[tuple[str, str, bool]]] = {
    "cell_outage": [
        ("Open a priority RAN ticket for the affected site with first-drop timestamp", "noc", True),
        (
            "Check site power and backhaul alarms; correlate with weather at the site",
            "core_network",
            False,
        ),
        ("Enable neighbour-cell or secondary-network fallback for critical assets", "noc", False),
    ],
    "congestion": [
        (
            "Request PRB utilisation counters and load rebalancing from the operator",
            "carrier_relations",
            False,
        ),
        (
            "Push reporting jitter and exponential back-off configuration to the fleet",
            "device_ops",
            True,
        ),
    ],
    "reconnect_storm": [
        (
            "Enforce exponential back-off with jitter on reconnect via configuration",
            "device_ops",
            True,
        ),
        ("Align MQTT keep-alive with carrier NAT timeouts", "device_ops", False),
        ("Rate-limit reconnects on the broker while the fleet recovers", "noc", True),
    ],
    "roaming_misconfig": [
        (
            "Verify the IMSI range is opened at the visited partner network",
            "carrier_relations",
            False,
        ),
        (
            "Correct roaming restrictions in the subscriber profile for the SIM group",
            "core_network",
            False,
        ),
        ("Temporarily allow an alternative partner network in the same country", "noc", True),
    ],
    "apn_error": [
        (
            "Roll back the latest APN / subscriber profile change for the affected SIMs",
            "core_network",
            False,
        ),
        (
            "Push the corrected APN configuration over the air if devices were reconfigured",
            "device_ops",
            True,
        ),
    ],
    "firmware_regression": [
        ("Halt the staged firmware rollout immediately", "device_ops", True),
        (
            "Roll back affected devices to the previous build over the air in waves",
            "device_ops",
            True,
        ),
        ("Add reset-rate to the rollout canary gate before resuming", "device_ops", False),
    ],
}

_CUSTOMER: dict[str, str] = {
    "cell_outage": "A temporary network outage is affecting devices in one coverage area. Devices will reconnect and upload buffered data automatically; no action is needed.",
    "congestion": "Some devices are connecting more slowly because the local network is busy. No data is lost and we are working with the network operator.",
    "reconnect_storm": "Some devices were reconnecting more often than normal, which can shorten battery life. A remote configuration fix is being applied.",
    "roaming_misconfig": "Devices operating abroad on one partner network could not connect due to a configuration issue. We are correcting it remotely.",
    "apn_error": "Some devices could not start data sessions because of a network configuration issue. It is being restored remotely; no on-site action is needed.",
    "firmware_regression": "A recent software update caused some devices to restart. The update is paused and the previous version is being restored remotely.",
    "insufficient_evidence": "We are investigating a possible connectivity issue and will update you as soon as we have confirmed details.",
}


class FakeDiagnosisModel:
    """Deterministic 'LLM' that reasons over the structured evidence in the prompt.

    It reads the JSON inside ``<evidence>`` and the runbook ids in context,
    applies an expert-rule decision list (the same reasoning the system prompt
    asks a real model to follow) and returns schema-conformant JSON. Chaos
    switches let tests exercise the guardrails.
    """

    provider = "fake"

    def __init__(self, model: str = "fake-diagnosis-v1", chaos: str | None = None) -> None:
        self.model = model
        self.chaos = (
            chaos  # None | "hallucinate_device" | "invalid_json" | "overconfident_truck_roll"
        )
        self.calls = 0

    def complete_json(
        self, system: str, user: str, schema: dict[str, Any], schema_name: str
    ) -> ChatResult:
        self.calls += 1
        m = EVIDENCE_RE.search(user)
        ev: dict[str, Any] = json.loads(m.group(1)) if m else {}
        runbooks = list(dict.fromkeys(RUNBOOKS_RE.findall(user)))
        out = self._reason(ev, runbooks)
        if self.chaos == "hallucinate_device":
            out["referenced_device_ids"] = [*out["referenced_device_ids"], "dev-99999999"]
            out["evidence"].append("Device dev-99999999 shows the same pattern")
        if self.chaos == "overconfident_truck_roll":
            out["truck_roll_required"] = True
        content = (
            "{not json" if self.chaos == "invalid_json" and self.calls == 1 else json.dumps(out)
        )
        return ChatResult(
            content=content,
            model=self.model,
            input_tokens=(len(system) + len(user)) // 4,
            output_tokens=len(content) // 4,
        )

    @staticmethod
    def _reason(ev: dict[str, Any], runbooks: list[str]) -> dict[str, Any]:
        inc = ev.get("incident", {})
        signals = {s["metric"]: s for s in inc.get("signals", []) if s.get("zscore", 0) != 0}
        causes: dict[str, int] = inc.get("top_causes", {})
        affected = int(inc.get("affected_devices", 0))
        scope_type = inc.get("scope_type")
        suspected = inc.get("suspected_fault", "")
        top_cause = max(causes, key=lambda k: causes[k]) if causes else ""

        if affected < 3 or not signals:
            root = "insufficient_evidence"
        elif scope_type == "firmware" and "reset_ratio" in signals:
            root = "firmware_regression"
        elif scope_type == "apn" or top_cause in ("ESM_27", "ESM_33"):
            root = "apn_error"
        elif scope_type == "plmn" or top_cause in ("EMM_13", "EMM_15"):
            root = "roaming_misconfig"
        elif "no_service_ratio" in signals:
            root = "cell_outage"
        elif "sinr_mean_db" in signals or top_cause == "EMM_22":
            root = "congestion"
        elif "reconnects_per_event" in signals:
            root = "reconnect_storm"
        else:
            root = suspected or "insufficient_evidence"

        zmax = max((abs(float(s["zscore"])) for s in signals.values()), default=0.0)
        confidence = (
            0.3
            if root == "insufficient_evidence"
            else min(0.97, 0.6 + 0.04 * min(zmax, 8) + 0.002 * min(affected, 50))
        )
        evidence = [
            f"{name} = {s['value']} vs baseline {s['baseline']} (z = {s['zscore']})"
            for name, s in sorted(signals.items())
        ][:5]
        if top_cause:
            evidence.append(f"dominant reject cause {top_cause} ({causes[top_cause]} events)")
        evidence.append(
            f"{affected} of {inc.get('total_devices', 0)} devices in {scope_type} {inc.get('scope')} affected"
        )
        for item in ev.get("enrichment", []):
            if item.get("source") == "weather" and item.get("data", {}).get("severe"):
                evidence.append("severe weather reported at the site location")
            if (
                item.get("source") == "carrier"
                and item.get("data", {}).get("roaming_agreement") is True
            ):
                evidence.append("roaming agreement exists, so the reject is a provisioning issue")
            if item.get("source") == "status_feed" and item.get("data", {}).get("relevant"):
                evidence.append("operator status feed reports a related active incident")
        steps = [
            {"order": n, "action": a, "owner": o, "automated": auto}
            for n, (a, o, auto) in enumerate(_REMEDIATION.get(root, []), start=1)
        ]
        if root == "insufficient_evidence":
            steps = [
                {
                    "order": 1,
                    "action": "Collect another detection window before acting",
                    "owner": "noc",
                    "automated": True,
                }
            ]
        sample = list(inc.get("sample_device_ids", []))[:3]
        return {
            "root_cause": root,
            "confidence": round(confidence, 3),
            "summary": f"Suspected {root.replace('_', ' ')} on {scope_type} {inc.get('scope')} affecting {affected} devices.",
            "evidence": evidence[:8],
            "remediation_steps": steps,
            "truck_roll_required": False,
            "customer_message": _CUSTOMER[root],
            "referenced_device_ids": sample,
            "runbook_ids": runbooks[:3],
        }
