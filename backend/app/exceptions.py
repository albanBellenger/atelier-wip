"""Structured API errors (handled in main.py)."""


class AppError(Exception):
    """Application error with stable machine-readable `code` for clients."""

    def __init__(self, *, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)
