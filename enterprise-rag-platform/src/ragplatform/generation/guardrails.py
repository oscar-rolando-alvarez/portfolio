"""Prompt-injection heuristics for *retrieved content* and user queries.

Indirect prompt injection (instructions planted inside documents) is the main RAG-specific
attack. Defence in depth:
1. score every chunk at ingestion time (stored in chunk metadata) and again at query time;
2. drop or annotate suspicious chunks before they reach the model (``InjectionPolicy``);
3. wrap all context in delimited ``<source>`` elements and instruct the model to treat it
   strictly as data;
4. validate citations after generation (the model can only cite chunks it was shown).
Heuristics are cheap and deterministic; a classifier model can be added behind
``InjectionDetector`` without changing callers.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_PATTERNS: tuple[tuple[str, float, re.Pattern[str]], ...] = tuple(
    (name, weight, re.compile(rx, re.IGNORECASE))
    for name, weight, rx in (
        (
            "override_instructions",
            0.6,
            r"\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier|system)\b[^.\n]{0,30}\b(instructions?|prompts?|rules|guidelines|context)\b",
        ),
        (
            "role_hijack",
            0.4,
            r"\byou are now\b|\bact as (an?|the) (unrestricted|jailbroken|developer)|\bnew (system )?instructions?\s*:",
        ),
        (
            "prompt_exfiltration",
            0.5,
            r"\b(reveal|print|show|repeat|leak)\b[^.\n]{0,30}\b(system prompt|hidden instructions|your instructions|api key|secret)",
        ),
        (
            "chat_template_tokens",
            0.6,
            r"<\|?(im_start|im_end|system|endoftext)\|?>|\[/?INST\]|<<SYS>>",
        ),
        ("fake_role_header", 0.3, r"(?m)^\s*(system|assistant)\s*:"),
        (
            "tool_or_exfil_call",
            0.4,
            r"\b(curl|wget|fetch)\s+https?://|!\[[^\]]*\]\(https?://[^)]*\?[^)]*=|send (it|this|the data) to\b",
        ),
        ("concealment", 0.3, r"\bdo not (tell|inform|mention)\b[^.\n]{0,20}\b(user|anyone)\b"),
    )
)


@dataclass(frozen=True, slots=True)
class InjectionVerdict:
    score: float
    signals: list[str]

    def is_suspicious(self, threshold: float) -> bool:
        return self.score >= threshold


class InjectionDetector:
    def assess(self, text: str) -> InjectionVerdict:
        signals: list[str] = []
        score = 0.0
        for name, weight, pattern in _PATTERNS:
            if pattern.search(text):
                signals.append(name)
                score += weight
        return InjectionVerdict(score=min(1.0, round(score, 3)), signals=signals)


def neutralize(text: str) -> str:
    """Escape delimiter look-alikes so content cannot close its own ``<source>`` element."""
    return text.replace("</source", "&lt;/source").replace("<source", "&lt;source")
