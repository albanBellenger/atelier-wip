"""Overlapping character windows for embedding."""

CHUNK_SIZE = 1800
CHUNK_OVERLAP = 200


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split plain text into overlapping chunks (character-based)."""
    cleaned = text.strip()
    if not cleaned:
        return []
    if chunk_size <= 0:
        return [cleaned]
    step = max(chunk_size - overlap, 1)
    chunks: list[str] = []
    i = 0
    while i < len(cleaned):
        piece = cleaned[i : i + chunk_size]
        if piece.strip():
            chunks.append(piece)
        i += step
    return chunks if chunks else [cleaned[:chunk_size]]
