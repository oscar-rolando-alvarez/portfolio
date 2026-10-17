"""Structure-aware chunking.

Rules (in priority order):
1. Headings are hard boundaries: a chunk never spans two sections, and every chunk
   carries its section breadcrumb (``section_path``) for citations and retrieval context.
2. Blocks are packed greedily up to ``target_tokens``.
3. Oversized prose blocks are split on sentence boundaries with a sentence-level
   overlap of roughly ``overlap_tokens``; code/tables are split on line boundaries.
"""

from __future__ import annotations

from dataclasses import dataclass

from ragplatform.domain.models import Block, BlockKind, ParsedDocument
from ragplatform.domain.text import estimate_tokens, split_sentences


@dataclass(frozen=True, slots=True)
class RawChunk:
    content: str
    section_path: list[str]
    page: int | None
    token_count: int


def search_text(title: str, section_path: list[str], content: str) -> str:
    """Contextual header + body; used for both embeddings and full-text indexing."""
    crumb = " > ".join([title, *section_path]) if section_path else title
    return f"{crumb}\n{content}"


class StructureAwareChunker:
    def __init__(self, target_tokens: int = 220, overlap_tokens: int = 40) -> None:
        if overlap_tokens >= target_tokens:
            raise ValueError("overlap must be smaller than the target chunk size")
        self.target = target_tokens
        self.overlap = overlap_tokens

    def chunk(self, doc: ParsedDocument) -> list[RawChunk]:
        chunks: list[RawChunk] = []
        headings: list[tuple[int, str]] = []
        parts: list[str] = []
        tokens = 0
        page: int | None = None

        def flush() -> None:
            nonlocal parts, tokens, page
            if parts:
                content = "\n\n".join(parts)
                chunks.append(
                    RawChunk(content, [h for _, h in headings], page, estimate_tokens(content))
                )
            parts, tokens, page = [], 0, None

        for block in doc.blocks:
            if block.kind == BlockKind.HEADING:
                flush()
                headings = [(lvl, h) for lvl, h in headings if lvl < block.level]
                headings.append((block.level, block.text))
                continue
            for piece in self._pieces(block):
                n = estimate_tokens(piece)
                if parts and tokens + n > self.target:
                    flush()
                if page is None:
                    page = block.page
                parts.append(piece)
                tokens += n
        flush()
        return chunks

    def _pieces(self, block: Block) -> list[str]:
        if estimate_tokens(block.text) <= self.target:
            return [block.text]
        if block.kind in (BlockKind.CODE, BlockKind.TABLE, BlockKind.LIST):
            return self._split_units(block.text.splitlines(), sep="\n", overlap=False)
        return self._split_units(split_sentences(block.text), sep=" ", overlap=True)

    def _split_units(self, units: list[str], *, sep: str, overlap: bool) -> list[str]:
        windows: list[str] = []
        current: list[str] = []
        tokens = 0
        for unit in units:
            n = estimate_tokens(unit)
            if current and tokens + n > self.target:
                windows.append(sep.join(current))
                if overlap:
                    carry: list[str] = []
                    carry_tokens = 0
                    for prev in reversed(current):
                        t = estimate_tokens(prev)
                        if carry_tokens + t > self.overlap:
                            break
                        carry.insert(0, prev)
                        carry_tokens += t
                    current, tokens = carry, carry_tokens
                else:
                    current, tokens = [], 0
            current.append(unit)
            tokens += n
        if current:
            windows.append(sep.join(current))
        return windows
