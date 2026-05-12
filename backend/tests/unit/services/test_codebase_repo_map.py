"""Repo map PageRank helper."""

from app.services.codebase_repo_map import build_repo_map, repo_map_lru


def test_build_repo_map_orders_paths() -> None:
    m = build_repo_map(["src/a.py", "src/b.py", "root.md"], token_budget=500)
    assert "ranked_paths" in m
    assert m["ranked_paths"]


def test_repo_map_lru_stable() -> None:
    paths = ["x/a.py", "x/b.py"]
    a = repo_map_lru("snap1", 400, paths)
    b = repo_map_lru("snap1", 400, paths)
    assert a == b


def test_build_repo_map_handles_isolated_paths() -> None:
    """Isolated nodes (no same-directory peers) must not break PageRank."""
    m = build_repo_map(["only/alone.py", "src/a.py", "src/b.py"], token_budget=500)
    assert m["ranked_paths"]
    assert sum(m["scores"].values()) > 0
