"""Repository structure summarisation via PageRank (Slice 16c)."""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

import networkx as nx


_CACHE_MAX = 64
_repo_map_cache: OrderedDict[tuple[str, int, tuple[str, ...]], dict[str, Any]] = OrderedDict()


def build_repo_map(file_paths: list[str], token_budget: int) -> dict[str, Any]:
    """Undirected co-directory graph; PageRank highlights central modules."""
    paths = sorted({p.replace("\\", "/").strip("/") for p in file_paths if p.strip()})
    G = nx.Graph()
    for p in paths:
        G.add_node(p)
    dirs: dict[str, list[str]] = {}
    for p in paths:
        parent = p.rsplit("/", 1)[0] if "/" in p else ""
        dirs.setdefault(parent, []).append(p)
    for group in dirs.values():
        for i, a in enumerate(group):
            for b in group[i + 1 :]:
                G.add_edge(a, b)
    if G.number_of_nodes() == 0:
        return {"nodes": [], "ranked_paths": [], "scores": {}}

    pr = nx.pagerank(G, alpha=0.85)
    ranked = sorted(pr.items(), key=lambda x: (-x[1], x[0]))
    picked: list[str] = []
    cost = 0
    for path, _score in ranked:
        step = len(path) + 24
        if cost + step > max(token_budget, 64):
            break
        picked.append(path)
        cost += step
    top_scores = {k: float(v) for k, v in ranked[:40]}
    return {
        "nodes": paths[:200],
        "ranked_paths": picked,
        "scores": top_scores,
    }


def repo_map_lru(snapshot_id: str, token_budget: int, file_paths: list[str]) -> dict[str, Any]:
    """LRU cache keyed by snapshot id, budget, and path multiset."""
    key = (snapshot_id, int(token_budget), tuple(sorted(set(file_paths))))
    hit = _repo_map_cache.pop(key, None)
    if hit is not None:
        _repo_map_cache[key] = hit
        return hit
    built = build_repo_map(list(key[2]), token_budget)
    _repo_map_cache[key] = built
    while len(_repo_map_cache) > _CACHE_MAX:
        _repo_map_cache.popitem(last=False)
    return built
