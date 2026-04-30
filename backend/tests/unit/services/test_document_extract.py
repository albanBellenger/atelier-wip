"""Unit tests for document extraction helpers."""

import pytest

from app.services.document_extract import (
    DocumentExtractError,
    extract_md_text,
    infer_file_type_from_name,
    validate_md_bytes,
    validate_pdf_magic,
)


def test_validate_pdf_magic() -> None:
    validate_pdf_magic(b"%PDF-1.4")
    with pytest.raises(DocumentExtractError):
        validate_pdf_magic(b"xxxx")


def test_validate_md_bytes_rejects_nul() -> None:
    with pytest.raises(DocumentExtractError):
        validate_md_bytes(b"hello\x00world")


def test_extract_md_text_ok() -> None:
    assert extract_md_text(b"  # hi  \n") == "# hi"


def test_infer_file_type() -> None:
    assert infer_file_type_from_name("X.PDF") == "pdf"
    assert infer_file_type_from_name("note.md") == "md"
    assert infer_file_type_from_name("x.txt") is None
