"""Citation extraction and validation: the model may only cite chunks it was shown."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from ragplatform.domain.models import Candidate, Citation

_CITE_RE = re.compile(
    r"\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
    r"((?:\s*[,;]\s*[0-9a-fA-F-]{36})*)\]"
)
_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)


@dataclass(frozen=True, slots=True)
class CitationCheck:
    text: str
    citations: list[Citation]
    invalid_ids: list[str]


def extract_cited_ids(text: str) -> list[str]:
    ids: list[str] = []
    for m in _CITE_RE.finditer(text):
        for uid in _UUID_RE.findall(m.group(0)):
            if uid.lower() not in ids:
                ids.append(uid.lower())
    return ids


def validate_citations(text: str, context: Sequence[Candidate]) -> CitationCheck:
    """Keep citations that refer to context chunks; strip hallucinated ids from the text."""
    by_id = {str(c.chunk_id): c for c in context}
    cited = extract_cited_ids(text)
    invalid = [cid for cid in cited if cid not in by_id]

    def _clean(m: re.Match[str]) -> str:
        valid = [u for u in _UUID_RE.findall(m.group(0)) if u.lower() in by_id]
        return f"[{', '.join(v.lower() for v in valid)}]" if valid else ""

    cleaned = _CITE_RE.sub(_clean, text) if invalid else text
    citations = []
    for cid in cited:
        c = by_id.get(cid)
        if c is None:
            continue
        citations.append(
            Citation(
                chunk_id=UUID(cid),
                document_id=c.document_id,
                document_title=c.document_title,
                section=" > ".join(c.section_path),
                page=c.page,
                snippet=c.content[:240],
            )
        )
    return CitationCheck(cleaned.strip(), citations, invalid)
