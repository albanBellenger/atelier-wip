"""AST-aware source splitting with plain-text fallback (codebase index)."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Extensions supported by tree-sitter-language packs used in Slice 16.
_EXT_TO_TS_LANG: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".cs": "c_sharp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".md": "markdown",
}

# Embedded files (e.g. markdown `![](data:image/png;base64,...)`): embedding APIs cap
# per-input length; strip payloads so one line cannot exceed provider limits.
_EMBEDDED_BASE64_DATA = re.compile(
    r"data:[^;\s]+;base64,[A-Za-z0-9+/=\s\r\n]+",
    flags=re.MULTILINE,
)


_BINARY_SUFFIXES: frozenset[str] = frozenset(
    {
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "ico",
        "pdf",
        "zip",
        "gz",
        "tar",
        "7z",
        "exe",
        "dll",
        "so",
        "dylib",
        "woff",
        "woff2",
        "ttf",
        "eot",
        "mp3",
        "mp4",
        "mov",
        "avi",
    }
)


def should_skip_path(path: str) -> bool:
    p = path.replace("\\", "/").strip("/").lower()
    parts = p.split("/")
    if any(x in {"node_modules", ".git", "__pycache__", "dist", "build", ".next", "coverage"} for x in parts):
        return True
    if parts[-1].endswith(".min.js"):
        return True
    suf = parts[-1].rsplit(".", 1)[-1] if "." in parts[-1] else ""
    return suf in _BINARY_SUFFIXES


def sanitize_codebase_embed_text(text: str) -> str:
    """Remove embedded base64 data URLs so they do not blow past embedding input limits."""
    return _EMBEDDED_BASE64_DATA.sub("[binary data omitted]", text)


def tree_sitter_language_key(path: str) -> str | None:
    lower = path.lower()
    for ext, lang in _EXT_TO_TS_LANG.items():
        if lower.endswith(ext):
            return lang
    return None


@dataclass(frozen=True, slots=True)
class CodeChunkPiece:
    text: str
    start_line: int
    end_line: int


@dataclass(frozen=True, slots=True)
class CodeSymbolPiece:
    name: str
    kind: str
    start_line: int
    end_line: int


def _merge_small_chunks(pieces: list[CodeChunkPiece], max_chars: int) -> list[CodeChunkPiece]:
    if not pieces:
        return []
    # Any single piece may already exceed max_chars (e.g. one markdown line with huge content).
    expanded: list[CodeChunkPiece] = []
    for p in pieces:
        if len(p.text) <= max_chars:
            expanded.append(p)
            continue
        t = p.text
        for start in range(0, len(t), max_chars):
            seg = t[start : start + max_chars]
            expanded.append(
                CodeChunkPiece(text=seg, start_line=p.start_line, end_line=p.end_line)
            )
    pieces = [c for c in expanded if c.text]
    if not pieces:
        return []
    out: list[CodeChunkPiece] = []
    buf = pieces[0].text
    s_line = pieces[0].start_line
    e_line = pieces[0].end_line
    for nxt in pieces[1:]:
        if len(buf) + 2 + len(nxt.text) <= max_chars:
            buf = f"{buf}\n\n{nxt.text}"
            e_line = nxt.end_line
        else:
            out.append(CodeChunkPiece(text=buf.strip(), start_line=s_line, end_line=e_line))
            buf = nxt.text
            s_line = nxt.start_line
            e_line = nxt.end_line
    out.append(CodeChunkPiece(text=buf.strip(), start_line=s_line, end_line=e_line))
    return [c for c in out if c.text]


def _fallback_chunk_lines(text: str, max_chars: int) -> list[CodeChunkPiece]:
    lines = text.splitlines()
    pieces: list[CodeChunkPiece] = []
    buf: list[str] = []
    start_ln = 1
    width = 0
    for i, ln in enumerate(lines, start=1):
        add = len(ln) + (1 if buf else 0)
        if buf and width + add > max_chars:
            block = "\n".join(buf)
            pieces.append(
                CodeChunkPiece(
                    text=block,
                    start_line=start_ln,
                    end_line=i - 1,
                )
            )
            buf = [ln]
            start_ln = i
            width = len(ln)
        else:
            buf.append(ln)
            width += add
    if buf:
        pieces.append(
            CodeChunkPiece(
                text="\n".join(buf),
                start_line=start_ln,
                end_line=len(lines),
            )
        )
    return _merge_small_chunks(pieces, max_chars)


def chunk_source(path: str, text: str, *, max_chars: int = 2800) -> list[CodeChunkPiece]:
    text = sanitize_codebase_embed_text(text)
    lang = tree_sitter_language_key(path)
    if lang is None or lang == "markdown":
        return _fallback_chunk_lines(text, max_chars)

    try:
        from tree_sitter_languages import get_parser
    except ImportError:
        return _fallback_chunk_lines(text, max_chars)

    try:
        parser = get_parser(lang)
    except Exception:
        return _fallback_chunk_lines(text, max_chars)

    src_bytes = text.encode("utf-8")
    tree = parser.parse(src_bytes)
    root = tree.root_node

    split_types: frozenset[str] = frozenset(
        {
            "function_definition",
            "function_declaration",
            "function_item",
            "method_definition",
            "class_definition",
            "class_declaration",
            "impl_item",
            "interface_declaration",
            "type_alias_declaration",
            "mod_item",
        }
    )

    pieces: list[CodeChunkPiece] = []

    def walk(node: object) -> None:
        n = node
        tname = type(n).__name__
        if tname != "Node":
            return
        tp = getattr(n, "type", "")
        start_byte = int(getattr(n, "start_byte", 0))
        end_byte = int(getattr(n, "end_byte", 0))
        start_point = getattr(n, "start_point", None)
        end_point = getattr(n, "end_point", None)
        start_line = int(getattr(start_point, "row", 0)) + 1 if start_point is not None else 1
        end_line = int(getattr(end_point, "row", 0)) + 1 if end_point is not None else start_line
        if tp in split_types and end_byte > start_byte:
            chunk_txt = src_bytes[start_byte:end_byte].decode("utf-8", errors="replace")
            if chunk_txt.strip():
                pieces.append(
                    CodeChunkPiece(
                        text=chunk_txt.strip(),
                        start_line=start_line,
                        end_line=end_line,
                    )
                )
            return
        child_count = int(getattr(n, "child_count", 0) or 0)
        for i in range(child_count):
            ch = n.child(i)
            if ch is not None:
                walk(ch)

    walk(root)
    if not pieces:
        return _fallback_chunk_lines(text, max_chars)
    merged = _merge_small_chunks(pieces, max_chars)
    return merged if merged else _fallback_chunk_lines(text, max_chars)


_SYMBOL_TYPES: frozenset[str] = frozenset(
    {
        "function_definition",
        "function_declaration",
        "function_item",
        "method_definition",
        "class_definition",
        "class_declaration",
    }
)


def extract_symbols(path: str, text: str) -> list[CodeSymbolPiece]:
    lang = tree_sitter_language_key(path)
    if lang in (None, "markdown"):
        return []

    try:
        from tree_sitter_languages import get_parser
    except ImportError:
        return []

    try:
        parser = get_parser(lang)
    except Exception:
        return []

    src_bytes = text.encode("utf-8")
    tree = parser.parse(src_bytes)
    root = tree.root_node
    out: list[CodeSymbolPiece] = []

    name_re = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?(?:function|class|def|fn|func)\s+(\w+)", re.M)

    def ident_from_node(n: object) -> str | None:
        child_count = int(getattr(n, "child_count", 0) or 0)
        for i in range(child_count):
            ch = n.child(i)
            if ch is None:
                continue
            if getattr(ch, "type", "") == "identifier":
                start_byte = int(getattr(ch, "start_byte", 0))
                end_byte = int(getattr(ch, "end_byte", 0))
                return src_bytes[start_byte:end_byte].decode("utf-8", errors="replace")
        return None

    def walk(node: object) -> None:
        n = node
        if type(n).__name__ != "Node":
            return
        tp = getattr(n, "type", "")
        start_point = getattr(n, "start_point", None)
        end_point = getattr(n, "end_point", None)
        start_line = int(getattr(start_point, "row", 0)) + 1 if start_point is not None else 1
        end_line = int(getattr(end_point, "row", 0)) + 1 if end_point is not None else start_line
        if tp in _SYMBOL_TYPES:
            name = ident_from_node(n)
            if name:
                kind = "function" if "function" in tp or "method" in tp else "class"
                out.append(
                    CodeSymbolPiece(
                        name=name,
                        kind=kind,
                        start_line=start_line,
                        end_line=end_line,
                    )
                )
        child_count = int(getattr(n, "child_count", 0) or 0)
        for i in range(child_count):
            ch = n.child(i)
            if ch is not None:
                walk(ch)

    walk(root)
    if not out and lang == "python":
        for m in name_re.finditer(text):
            line_no = text[: m.start()].count("\n") + 1
            out.append(
                CodeSymbolPiece(name=m.group(1), kind="function", start_line=line_no, end_line=line_no)
            )
    return out
