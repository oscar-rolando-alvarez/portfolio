"""Deterministic PII detection and redaction.

Regex + checksum validation (Luhn for cards, mod-97 for IBAN) keeps false positives low
and runs in-process, so raw PII never leaves the trust boundary to be "detected". A
model-based NER detector can be plugged in behind the same interface (roadmap).
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass


def _luhn_ok(candidate: str) -> bool:
    digits = [int(c) for c in candidate if c.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for i, digit in enumerate(reversed(digits)):
        doubled = digit * 2 if i % 2 == 1 else digit
        total += doubled - 9 if doubled > 9 else doubled
    return total % 10 == 0


def _iban_ok(candidate: str) -> bool:
    s = candidate.replace(" ", "").upper()
    if not 15 <= len(s) <= 34:
        return False
    rearranged = s[4:] + s[:4]
    numeric = "".join(str(int(c, 36)) for c in rearranged)
    return int(numeric) % 97 == 1


def _ssn_ok(candidate: str) -> bool:
    area, group, serial = candidate.split("-")
    return (
        area not in {"000", "666"}
        and not area.startswith("9")
        and group != "00"
        and serial != "0000"
    )


@dataclass(frozen=True, slots=True)
class _Detector:
    label: str
    pattern: re.Pattern[str]
    validate: Callable[[str], bool] | None = None


_DETECTORS: tuple[_Detector, ...] = (
    _Detector("EMAIL", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    _Detector("CREDIT_CARD", re.compile(r"\b(?:\d[ -]?){12,18}\d\b"), _luhn_ok),
    _Detector(
        "IBAN", re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b"), _iban_ok
    ),
    _Detector("US_SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), _ssn_ok),
    _Detector(
        "PHONE",
        re.compile(
            r"(?<![\w-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4}\b"
        ),
    ),
    _Detector(
        "IP_ADDRESS",
        re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"),
    ),
)


@dataclass(frozen=True, slots=True)
class PiiResult:
    text: str
    counts: dict[str, int]

    @property
    def found(self) -> bool:
        return bool(self.counts)


class PiiRedactor:
    """Finds PII spans (non-overlapping, earliest detector wins) and optionally masks them."""

    def __init__(self, detectors: tuple[_Detector, ...] = _DETECTORS) -> None:
        self._detectors = detectors

    def scan(self, text: str, *, redact: bool) -> PiiResult:
        spans: list[tuple[int, int, str]] = []
        for det in self._detectors:
            for m in det.pattern.finditer(text):
                if det.validate and not det.validate(m.group(0)):
                    continue
                if any(m.start() < e and s < m.end() for s, e, _ in spans):
                    continue
                spans.append((m.start(), m.end(), det.label))
        counts = Counter(label for _, _, label in spans)
        if not redact or not spans:
            return PiiResult(text, dict(counts))
        out: list[str] = []
        cursor = 0
        for start, end, label in sorted(spans):
            out.append(text[cursor:start])
            out.append(f"[REDACTED:{label}]")
            cursor = end
        out.append(text[cursor:])
        return PiiResult("".join(out), dict(counts))
