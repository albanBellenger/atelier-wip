"""Fernet encryption for secrets at rest (e.g. GitLab tokens)."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

_fernet: Fernet | None = None


def reset_fernet_cache() -> None:
    """Used when tests override ENCRYPTION_KEY."""
    global _fernet
    _fernet = None


def _load_fernet() -> Fernet | None:
    global _fernet
    if _fernet is not None:
        return _fernet
    key = get_settings().encryption_key.strip()
    if not key:
        return None
    try:
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError):
        return None
    return _fernet


def fernet_configured() -> bool:
    return _load_fernet() is not None


def encrypt_secret(plain: str | None) -> str | None:
    if plain is None or plain == "":
        return None
    f = _load_fernet()
    if f is None:
        return None
    return f.encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_secret(ciphertext: str | None) -> str | None:
    if ciphertext is None or ciphertext == "":
        return None
    f = _load_fernet()
    if f is None:
        return None
    try:
        return f.decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return None


def decode_admin_stored_secret(stored: str | None) -> str | None:
    """Return plaintext for tool-admin API keys (Fernet at rest or legacy plaintext)."""
    if stored is None or str(stored).strip() == "":
        return None
    s = str(stored).strip()
    if fernet_configured():
        dec = decrypt_secret(s)
        if dec is not None:
            return dec
    return s


def encode_admin_stored_secret(plain: str | None) -> str | None:
    """Persist tool-admin API keys with Fernet when configured; else store plaintext (dev only)."""
    if plain is None or str(plain).strip() == "":
        return None
    p = str(plain).strip()
    if not fernet_configured():
        return p
    enc = encrypt_secret(p)
    return enc if enc is not None else p


def admin_secret_suffix_hint(stored: str | None) -> str | None:
    """Safe UI hint (last 4 chars); never the full secret."""
    plain = decode_admin_stored_secret(stored)
    if not plain:
        return None
    tail = plain[-4:] if len(plain) >= 4 else plain
    return f"…{tail}"
