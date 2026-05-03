"""Chunking strategies for artifact RAG text.

We keep the legacy overlapping character windows as ``fixed_window`` (or DB ``NULL``).
Optional strategies use LlamaIndex node parsers: ``SentenceSplitter`` for sentence-aware
windows, ``MarkdownNodeParser`` for heading/section splits on Markdown sources.

See: https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/modules/
"""

from __future__ import annotations

from llama_index.core import Document
from llama_index.core.node_parser import MarkdownNodeParser, SentenceSplitter

from app.exceptions import ApiError
from app.services.text_chunking import CHUNK_OVERLAP, CHUNK_SIZE, chunk_text

ARTIFACT_CHUNKING_STRATEGIES: tuple[str, ...] = (
    "fixed_window",
    "sentence",
    "markdown",
)


def validate_chunking_strategy(value: str | None) -> str | None:
    """Normalize strategy; ``None`` clears to default (fixed window)."""
    if value is None:
        return None
    v = value.strip().lower()
    if not v or v == "fixed_window":
        return None
    if v not in ARTIFACT_CHUNKING_STRATEGIES:
        raise ApiError(
            status_code=422,
            code="INVALID_CHUNKING_STRATEGY",
            message=f"chunking_strategy must be one of: {', '.join(ARTIFACT_CHUNKING_STRATEGIES)} or null",
        )
    return v


def chunk_artifact_text(text: str, strategy: str | None) -> list[str]:
    """Split extracted artifact text into embedding chunks."""
    norm = (strategy or "").strip().lower() if strategy else ""
    if not norm or norm == "fixed_window":
        return chunk_text(text)
    if norm == "sentence":
        splitter = SentenceSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=min(CHUNK_OVERLAP, CHUNK_SIZE - 1)
            if CHUNK_SIZE > 1
            else 0,
        )
        nodes = splitter.get_nodes_from_documents([Document(text=text)])
        out = [n.get_content() for n in nodes if n.get_content().strip()]
        return out if out else []
    if norm == "markdown":
        parser = MarkdownNodeParser()
        nodes = parser.get_nodes_from_documents([Document(text=text)])
        out = [n.get_content() for n in nodes if n.get_content().strip()]
        return out if out else []
    return chunk_text(text)
