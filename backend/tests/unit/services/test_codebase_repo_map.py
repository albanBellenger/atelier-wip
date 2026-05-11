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
