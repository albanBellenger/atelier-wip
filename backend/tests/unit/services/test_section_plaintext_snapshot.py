"""Reconcile section.content with yjs_state for API plaintext snapshots."""

import uuid
from datetime import datetime, timezone

import pytest
from pycrdt import Doc, Text

from app.services.section_service import (
    SectionService,
    SECTION_YJS_TEXT_FIELD,
    effective_section_plaintext,
    snapshot_from_yjs_update_bytes,
)


def test_snapshot_from_yjs_roundtrip() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("hello from yjs")
    blob = doc.get_update()
    assert snapshot_from_yjs_update_bytes(blob) == "hello from yjs"


def test_effective_plaintext_prefers_yjs_when_content_is_none_string() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("body")
    blob = doc.get_update()
    assert effective_section_plaintext("None", blob) == "body"


def test_effective_plaintext_prefers_yjs_when_content_blank() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("only-yjs")
    blob = doc.get_update()
    assert effective_section_plaintext("", blob) == "only-yjs"
    assert effective_section_plaintext("   ", blob) == "only-yjs"


def test_effective_plaintext_keeps_non_empty_db_content() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("yjs")
    blob = doc.get_update()
    assert effective_section_plaintext("stored", blob) == "stored"


def test_effective_plaintext_invalid_yjs_falls_back() -> None:
    assert effective_section_plaintext("ok", b"not-a-valid-update") == "ok"
    assert effective_section_plaintext("", b"garbage") == ""


def test_section_service_to_response_uses_effective_plaintext() -> None:
    svc = SectionService(db=None)  # type: ignore[arg-type]
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("x")
    blob = doc.get_update()
    now = datetime.now(tz=timezone.utc)
    sid = uuid.uuid4()
    pid = uuid.uuid4()

    class FakeSec:
        id = sid
        project_id = pid
        title = "t"
        slug = "s"
        order = 0
        content = "None"
        yjs_state = blob
        created_at = now
        updated_at = now

    r = svc._to_response(FakeSec())  # noqa: SLF001
    assert r.content == "x"
