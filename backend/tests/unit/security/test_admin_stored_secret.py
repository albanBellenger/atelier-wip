"""Round-trip and legacy-plaintext behavior for tool-admin API key storage."""

from app.security.field_encryption import (
    admin_secret_suffix_hint,
    decode_admin_stored_secret,
    encode_admin_stored_secret,
)


def test_encode_decode_roundtrip() -> None:
    plain = "sk-secret-key-xyz9"
    enc = encode_admin_stored_secret(plain)
    assert enc is not None
    assert enc != plain
    assert decode_admin_stored_secret(enc) == plain
    assert admin_secret_suffix_hint(enc) == "…xyz9"


def test_decode_legacy_plaintext_when_not_valid_fernet() -> None:
    legacy = "sk-legacy-plain"
    assert decode_admin_stored_secret(legacy) == legacy
    assert admin_secret_suffix_hint(legacy) == "…lain"


def test_encode_none_or_empty() -> None:
    assert encode_admin_stored_secret(None) is None
    assert encode_admin_stored_secret("") is None
    assert encode_admin_stored_secret("   ") is None
