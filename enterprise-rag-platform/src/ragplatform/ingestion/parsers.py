"""Structure-preserving parsers: bytes -> ``ParsedDocument`` (title + typed blocks).

Keeping headings, lists, code and tables as distinct blocks lets the chunker respect
document structure and attach a section path (breadcrumb) to every chunk.
"""

from __future__ import annotations

import io
import re
from pathlib import PurePath

from bs4 import BeautifulSoup, Tag
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from ragplatform.domain.errors import ParseError, UnsupportedDocumentError
from ragplatform.domain.models import Block, BlockKind, ParsedDocument
from ragplatform.domain.text import normalize_ws

SUPPORTED_MIME_TYPES = {
    "application/pdf": "pdf",
    "text/markdown": "markdown",
    "text/x-markdown": "markdown",
    "text/html": "html",
    "application/xhtml+xml": "html",
    "text/plain": "text",
}
_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".txt": "text/plain",
}

_MD_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_MD_LIST = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
_MD_FENCE = re.compile(r"^\s*(```|~~~)")


def resolve_mime_type(filename: str | None, declared: str | None) -> str:
    declared = (declared or "").split(";")[0].strip().lower()
    if declared in SUPPORTED_MIME_TYPES:
        return declared
    if filename:
        ext = PurePath(filename).suffix.lower()
        if ext in _EXTENSIONS:
            return _EXTENSIONS[ext]
    raise UnsupportedDocumentError(
        f"unsupported document type {declared or filename!r}; "
        f"supported: {', '.join(sorted(_EXTENSIONS))}"
    )


def parse_document(data: bytes, mime_type: str, *, fallback_title: str) -> ParsedDocument:
    kind = SUPPORTED_MIME_TYPES.get(mime_type)
    if kind == "pdf":
        return _parse_pdf(data, fallback_title)
    if kind is None:
        raise UnsupportedDocumentError(f"unsupported mime type {mime_type!r}")
    text = _decode(data)
    if kind == "markdown":
        return _parse_markdown(text, fallback_title)
    if kind == "html":
        return _parse_html(text, fallback_title)
    return _parse_text(text, fallback_title)


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def _parse_text(text: str, title: str) -> ParsedDocument:
    blocks = [
        Block(BlockKind.PARAGRAPH, normalize_ws(p)) for p in re.split(r"\n\s*\n", text) if p.strip()
    ]
    return ParsedDocument(title=title, blocks=blocks)


def _parse_markdown(text: str, title: str) -> ParsedDocument:
    blocks: list[Block] = []
    buf: list[str] = []
    buf_kind = BlockKind.PARAGRAPH
    in_code = False
    doc_title: str | None = None

    def flush() -> None:
        nonlocal buf, buf_kind
        if buf:
            if buf_kind == BlockKind.CODE:
                content = "\n".join(buf)
            elif buf_kind in (BlockKind.TABLE, BlockKind.LIST):
                content = "\n".join(line.strip() for line in buf)
            else:
                content = normalize_ws(" ".join(buf))
            if content.strip():
                blocks.append(Block(buf_kind, content))
        buf = []
        buf_kind = BlockKind.PARAGRAPH

    for line in text.splitlines():
        if _MD_FENCE.match(line):
            if in_code:
                flush()
                in_code = False
            else:
                flush()
                in_code = True
                buf_kind = BlockKind.CODE
            continue
        if in_code:
            buf.append(line)
            continue
        if m := _MD_HEADING.match(line):
            flush()
            level, heading = len(m.group(1)), m.group(2).strip()
            if level == 1 and doc_title is None:
                doc_title = heading
            blocks.append(Block(BlockKind.HEADING, heading, level=level))
            continue
        if not line.strip():
            flush()
            continue
        kind = (
            BlockKind.TABLE
            if line.lstrip().startswith("|")
            else BlockKind.LIST
            if _MD_LIST.match(line)
            else BlockKind.PARAGRAPH
        )
        if buf and kind != buf_kind and not (buf_kind == BlockKind.LIST and line.startswith(" ")):
            flush()
        if not buf:
            buf_kind = kind
        buf.append(line)
    flush()
    return ParsedDocument(title=doc_title or title, blocks=blocks)


def _parse_html(text: str, title: str) -> ParsedDocument:
    soup = BeautifulSoup(text, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "form", "svg"]):
        tag.decompose()
    doc_title = soup.title.get_text(strip=True) if soup.title else None
    root = soup.body or soup
    blocks: list[Block] = []
    for el in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "pre", "table"]):
        if not isinstance(el, Tag):
            continue
        # skip elements nested in an already-captured container (e.g. <p> inside <li>)
        if el.find_parent(["li", "pre", "table"]) is not None:
            continue
        name = el.name
        if name.startswith("h") and len(name) == 2:
            heading = normalize_ws(el.get_text(" "))
            if heading:
                blocks.append(Block(BlockKind.HEADING, heading, level=int(name[1])))
                if name == "h1" and not doc_title:
                    doc_title = heading
        elif name == "pre":
            blocks.append(Block(BlockKind.CODE, el.get_text()))
        elif name == "table":
            rows = [
                " | ".join(normalize_ws(c.get_text(" ")) for c in tr.find_all(["th", "td"]))
                for tr in el.find_all("tr")
            ]
            blocks.append(Block(BlockKind.TABLE, "\n".join(r for r in rows if r)))
        else:
            content = normalize_ws(el.get_text(" "))
            if content:
                kind = BlockKind.LIST if name == "li" else BlockKind.PARAGRAPH
                blocks.append(Block(kind, f"- {content}" if kind == BlockKind.LIST else content))
    return ParsedDocument(title=doc_title or title, blocks=blocks)


def _looks_like_heading(line: str) -> bool:
    words = line.split()
    if not 1 <= len(words) <= 10 or line.endswith((".", ",", ";", ":")):
        return False
    return line.isupper() or all(w[:1].isupper() or not w[:1].isalpha() for w in words)


def _parse_pdf(data: bytes, title: str) -> ParsedDocument:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ParseError("encrypted PDFs are not supported")
        pages = [page.extract_text() or "" for page in reader.pages]
        meta_title = reader.metadata.title if reader.metadata else None
    except PdfReadError as exc:
        raise ParseError(f"invalid PDF: {exc}") from exc
    blocks: list[Block] = []
    for page_no, page_text in enumerate(pages, start=1):
        para: list[str] = []
        for raw in page_text.splitlines():
            line = raw.strip()
            if not line:
                if para:
                    blocks.append(
                        Block(BlockKind.PARAGRAPH, normalize_ws(" ".join(para)), page=page_no)
                    )
                    para = []
                continue
            if _looks_like_heading(line) and not para:
                blocks.append(Block(BlockKind.HEADING, line, level=2, page=page_no))
                continue
            para.append(line)
        if para:
            blocks.append(Block(BlockKind.PARAGRAPH, normalize_ws(" ".join(para)), page=page_no))
    if not blocks:
        raise ParseError("no extractable text (scanned PDF? OCR is on the roadmap)")
    return ParsedDocument(title=str(meta_title) if meta_title else title, blocks=blocks)
