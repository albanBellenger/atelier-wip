"""Password hashing (native bcrypt; avoids passlib vs bcrypt 4.x incompatibility)."""

import logging

import bcrypt

log = logging.getLogger(__name__)

# bcrypt rejects secrets longer than this (bytes after UTF-8 encoding).
BCRYPT_MAX_PASSWORD_BYTES = 72

# Match typical passlib bcrypt cost factor for continuity with existing hashes.
_BCRYPT_ROUNDS = 12


def _utf8_byte_length(s: str) -> int:
    return len(s.encode("utf-8"))


def hash_password(plain: str) -> str:
    n = _utf8_byte_length(plain)
    if n > BCRYPT_MAX_PASSWORD_BYTES:
        log.error(
            "hash_password: password over bcrypt byte limit (%s > %s); "
            "validation layer should have rejected this",
            n,
            BCRYPT_MAX_PASSWORD_BYTES,
        )
        raise ValueError(
            f"password exceeds bcrypt limit ({n} UTF-8 bytes > {BCRYPT_MAX_PASSWORD_BYTES})"
        )
    digest = bcrypt.hashpw(
        plain.encode("utf-8"),
        bcrypt.gensalt(rounds=_BCRYPT_ROUNDS),
    )
    return digest.decode("ascii")


def verify_password(plain: str, password_hash: str) -> bool:
    if _utf8_byte_length(plain) > BCRYPT_MAX_PASSWORD_BYTES:
        log.debug(
            "verify_password: plaintext over bcrypt byte limit; treating as mismatch"
        )
        return False
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False
