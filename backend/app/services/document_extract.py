"""PDF / Markdown extraction and magic-byte validation."""

from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader


class DocumentExtractError(ValueError):
    """Invalid file type or unreadable document."""


def validate_pdf_magic(header: bytes) -> None:
    if not header.startswith(b"%PDF"):
        raise DocumentExtractError("Not a valid PDF file")


def validate_md_bytes(raw: bytes) -> None:
    if b"\x00" in raw[:4096]:
        raise DocumentExtractError("Markdown must be UTF-8 text")
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as e:
        raise DocumentExtractError("Markdown must be valid UTF-8") from e


def extract_pdf_text(raw: bytes) -> str:
    validate_pdf_magic(raw[:8])
    reader = PdfReader(BytesIO(raw))
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text()
            if t:
                parts.append(t)
        except Exception:
            continue
    return "\n\n".join(parts).strip()


def extract_md_text(raw: bytes) -> str:
    validate_md_bytes(raw)
    return raw.decode("utf-8").strip()


def infer_file_type_from_name(filename: str) -> str | None:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return "pdf"
    if lower.endswith(".md"):
        return "md"
    return None
