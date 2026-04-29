"""Structured API errors — subclass FastAPI HTTPException per backend rules."""

from fastapi import HTTPException


class ApiError(HTTPException):
    """Machine-readable error code + message; handler returns flat `{detail, code}` JSON."""

    def __init__(self, *, status_code: int, code: str, message: str) -> None:
        self.error_code = code
        super().__init__(status_code=status_code, detail=message)
