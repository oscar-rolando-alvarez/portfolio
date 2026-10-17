from __future__ import annotations

import pytest

from ragplatform.domain.errors import ParseError, UnsupportedDocumentError
from ragplatform.domain.models import Block, BlockKind, ParsedDocument
from ragplatform.ingestion.chunker import StructureAwareChunker, search_text
from ragplatform.ingestion.parsers import parse_document, resolve_mime_type
from ragplatform.ingestion.pii import PiiRedactor


def _pdf_bytes(lines: list[str]) -> bytes:
    """Build a minimal, valid single-page PDF with the given text lines."""
    text_ops = ["BT", "/F1 12 Tf", "14 TL", "72 720 Td"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        text_ops.append(f"({escaped}) Tj T*")
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


class TestParsers:
    def test_markdown_keeps_structure(self) -> None:
        md = b"# Title\n\nIntro text.\n\n## Section A\n\n- one\n- two\n\n```\ncode line\n```\n\n| a | b |\n| 1 | 2 |\n"
        doc = parse_document(md, "text/markdown", fallback_title="f.md")
        assert doc.title == "Title"
        kinds = [b.kind for b in doc.blocks]
        assert kinds == [
            BlockKind.HEADING,
            BlockKind.PARAGRAPH,
            BlockKind.HEADING,
            BlockKind.LIST,
            BlockKind.CODE,
            BlockKind.TABLE,
        ]
        assert doc.blocks[3].text == "- one\n- two"

    def test_html_strips_boilerplate(self) -> None:
        html = (
            b"<html><head><title>T</title><script>evil()</script></head><body><nav>menu</nav>"
            b"<h1>Head</h1><p>Body <b>text</b>.</p><ul><li>item</li></ul>"
            b"<table><tr><th>k</th><td>v</td></tr></table></body></html>"
        )
        doc = parse_document(html, "text/html", fallback_title="x")
        texts = [b.text for b in doc.blocks]
        assert doc.title == "T"
        assert "evil()" not in " ".join(texts)
        assert "menu" not in " ".join(texts)
        assert texts == ["Head", "Body text .", "- item", "k | v"]

    def test_plain_text_paragraphs(self) -> None:
        doc = parse_document(b"one\ntwo\n\nthree", "text/plain", fallback_title="t.txt")
        assert [b.text for b in doc.blocks] == ["one two", "three"]

    def test_pdf_pages_and_headings(self) -> None:
        data = _pdf_bytes(["Security Overview", "", "All laptops use disk encryption."])
        doc = parse_document(data, "application/pdf", fallback_title="s.pdf")
        assert any(b.kind == BlockKind.HEADING for b in doc.blocks)
        assert any("disk encryption" in b.text for b in doc.blocks)
        assert all(b.page == 1 for b in doc.blocks)

    def test_invalid_pdf(self) -> None:
        with pytest.raises(ParseError):
            parse_document(b"%PDF-1.4 garbage", "application/pdf", fallback_title="x")

    def test_mime_resolution(self) -> None:
        assert resolve_mime_type("a.md", "application/octet-stream") == "text/markdown"
        assert resolve_mime_type(None, "text/html; charset=utf-8") == "text/html"
        with pytest.raises(UnsupportedDocumentError):
            resolve_mime_type("a.exe", None)


class TestChunker:
    def test_headings_are_hard_boundaries_with_breadcrumbs(self) -> None:
        doc = ParsedDocument(
            "Doc",
            [
                Block(BlockKind.HEADING, "A", level=1),
                Block(BlockKind.PARAGRAPH, "alpha text"),
                Block(BlockKind.HEADING, "B", level=2),
                Block(BlockKind.PARAGRAPH, "beta text"),
                Block(BlockKind.HEADING, "C", level=2),
                Block(BlockKind.PARAGRAPH, "gamma text"),
            ],
        )
        chunks = StructureAwareChunker(100, 10).chunk(doc)
        assert [c.content for c in chunks] == ["alpha text", "beta text", "gamma text"]
        assert [c.section_path for c in chunks] == [["A"], ["A", "B"], ["A", "C"]]

    def test_oversized_paragraph_split_with_overlap(self) -> None:
        sentences = [f"Sentence number {i} talks about topic {i}." for i in range(40)]
        doc = ParsedDocument("Doc", [Block(BlockKind.PARAGRAPH, " ".join(sentences))])
        chunks = StructureAwareChunker(60, 15).chunk(doc)
        assert len(chunks) > 3
        assert all(c.token_count <= 75 for c in chunks)
        # consecutive chunks share at least one sentence (overlap)
        first_tail = chunks[0].content.split(". ")[-1]
        assert first_tail.rstrip(".") in chunks[1].content

    def test_small_blocks_are_packed(self) -> None:
        doc = ParsedDocument("D", [Block(BlockKind.PARAGRAPH, f"p{i}") for i in range(5)])
        assert len(StructureAwareChunker(100, 10).chunk(doc)) == 1

    def test_invalid_overlap(self) -> None:
        with pytest.raises(ValueError, match="overlap"):
            StructureAwareChunker(50, 50)

    def test_search_text_includes_breadcrumb(self) -> None:
        assert search_text("T", ["A", "B"], "body") == "T > A > B\nbody"


class TestPii:
    def test_detects_and_redacts(self) -> None:
        text = (
            "Mail jane.doe@corp.example or call +1 415 555 0134. SSN 123-45-6789, "
            "card 4111 1111 1111 1111, IBAN DE89 3704 0044 0532 0130 00, host 10.0.0.12."
        )
        result = PiiRedactor().scan(text, redact=True)
        assert result.counts == {
            "EMAIL": 1,
            "PHONE": 1,
            "US_SSN": 1,
            "CREDIT_CARD": 1,
            "IBAN": 1,
            "IP_ADDRESS": 1,
        }
        for raw in ("jane.doe", "555 0134", "123-45-6789", "4111", "DE89", "10.0.0.12"):
            assert raw not in result.text
        assert "[REDACTED:EMAIL]" in result.text

    def test_checksums_reduce_false_positives(self) -> None:
        result = PiiRedactor().scan("order 4111 1111 1111 1112 and id 000-12-3456", redact=True)
        assert "CREDIT_CARD" not in result.counts
        assert "US_SSN" not in result.counts

    def test_detect_only_keeps_text(self) -> None:
        result = PiiRedactor().scan("contact a@b.io", redact=False)
        assert result.found
        assert result.text == "contact a@b.io"
