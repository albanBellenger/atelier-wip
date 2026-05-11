"""GitLab REST helpers for commits and history (Slice 11)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx

from app.exceptions import ApiError
from app.integrations.gitlab_client import parse_gitlab_web_url

log = logging.getLogger("atelier.git")


def _enc_project_path(project_path: str) -> str:
    return quote(project_path, safe="")


def _enc_file_path(file_path: str) -> str:
    return quote(file_path, safe="")


async def gitlab_file_exists(
    *,
    api_origin: str,
    project_path: str,
    token: str,
    branch: str,
    file_path: str,
) -> bool:
    enc_p = _enc_project_path(project_path)
    enc_f = _enc_file_path(file_path.replace("\\", "/").strip("/"))
    url = f"{api_origin}/api/v4/projects/{enc_p}/repository/files/{enc_f}"
    headers = {"PRIVATE-TOKEN": token.strip()}
    params = {"ref": branch.strip()}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except httpx.TimeoutException as e:
        log.warning("gitlab_file_exists_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_file_exists_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    if r.status_code == 200:
        return True
    if r.status_code == 404:
        return False
    log.warning(
        "gitlab_file_head_failed status=%s body=%s",
        r.status_code,
        r.text[:200],
    )
    return False


async def commit_files(
    *,
    repo_web_url: str,
    token: str,
    branch: str,
    files: dict[str, str],
    message: str,
) -> tuple[str, str | None]:
    """
    Single GitLab commit with multiple file actions.
    Returns (web_url_or_empty, short_sha_or_none).
    """
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    url = f"{origin}/api/v4/projects/{enc_p}/repository/commits"
    headers = {"PRIVATE-TOKEN": token.strip()}
    actions: list[dict[str, Any]] = []
    br = branch.strip() or "main"
    for path, content in sorted(files.items()):
        norm = path.replace("\\", "/").strip("/")
        exists = await gitlab_file_exists(
            api_origin=origin,
            project_path=project_path,
            token=token,
            branch=br,
            file_path=norm,
        )
        actions.append(
            {
                "action": "update" if exists else "create",
                "file_path": norm,
                "content": content,
            }
        )
    body = {
        "branch": br,
        "commit_message": message.strip() or "Publish from Atelier",
        "actions": actions,
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(url, headers=headers, json=body)
    except httpx.TimeoutException as e:
        log.warning("gitlab_commit_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_commit_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    if r.status_code not in (200, 201):
        detail = r.text[:500]
        log.warning(
            "gitlab_commit_http_error status=%s body=%s",
            r.status_code,
            detail[:500],
        )
        raise ApiError(
            status_code=502,
            code="GITLAB_ERROR",
            message="GitLab returned an error.",
        )
    data = r.json()
    web_url = str(data.get("web_url") or "")
    sha = data.get("id") or data.get("short_id")
    short_sha = str(sha)[:12] if sha else None
    return web_url, short_sha


async def list_commits(
    *,
    repo_web_url: str,
    token: str,
    branch: str,
    per_page: int = 20,
) -> list[dict[str, Any]]:
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    url = f"{origin}/api/v4/projects/{enc_p}/repository/commits"
    headers = {"PRIVATE-TOKEN": token.strip()}
    params = {"ref_name": branch.strip() or "main", "per_page": max(1, min(per_page, 100))}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except httpx.TimeoutException as e:
        log.warning("gitlab_list_commits_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_list_commits_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    if r.status_code != 200:
        detail = r.text[:300]
        log.warning(
            "gitlab_list_commits_http_error status=%s body=%s",
            r.status_code,
            detail[:500],
        )
        raise ApiError(
            status_code=502,
            code="GITLAB_ERROR",
            message="GitLab returned an error.",
        )
    rows = r.json()
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        out.append(
            {
                "id": row.get("id"),
                "short_id": row.get("short_id"),
                "title": row.get("title"),
                "message": row.get("message"),
                "author_name": (row.get("author_name") or "")
                if isinstance(row.get("author_name"), str)
                else "",
                "created_at": row.get("created_at"),
                "web_url": row.get("web_url"),
            }
        )
    return out


def moves_for_prefix_rename(
    old_prefix: str, new_prefix: str, blob_paths: list[str]
) -> list[tuple[str, str]]:
    """Build (previous_path, file_path) pairs for GitLab move actions; deepest paths first."""
    op = old_prefix.replace("\\", "/").strip("/")
    np = new_prefix.replace("\\", "/").strip("/")
    out: list[tuple[str, str]] = []
    for p in blob_paths:
        pn = p.replace("\\", "/").strip("/")
        if pn == op:
            out.append((pn, np))
        elif pn.startswith(op + "/"):
            rest = pn[len(op) + 1 :]
            out.append((pn, f"{np}/{rest}"))
    out.sort(key=lambda t: len(t[0]), reverse=True)
    return out


async def list_repo_blob_paths_under_prefix(
    *,
    repo_web_url: str,
    token: str,
    branch: str,
    path_prefix: str,
) -> list[str]:
    """
    List blob paths under path_prefix on ref branch (recursive repository tree API).
    Returns normalized slash-separated paths from repo root.
    """
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    prefix = path_prefix.replace("\\", "/").strip("/")
    url = f"{origin}/api/v4/projects/{enc_p}/repository/tree"
    headers = {"PRIVATE-TOKEN": token.strip()}
    br = branch.strip() or "main"
    paths_out: list[str] = []
    page = 1
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            while True:
                params: dict[str, Any] = {
                    "path": prefix,
                    "ref": br,
                    "recursive": True,
                    "per_page": 100,
                    "page": page,
                }
                r = await client.get(url, headers=headers, params=params)
                if r.status_code == 404:
                    return []
                if r.status_code != 200:
                    log.warning(
                        "gitlab_tree_http_error status=%s body=%s",
                        r.status_code,
                        r.text[:300],
                    )
                    raise ApiError(
                        status_code=502,
                        code="GITLAB_ERROR",
                        message="GitLab returned an error.",
                    )
                rows = r.json()
                if not isinstance(rows, list) or not rows:
                    break
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    if row.get("type") != "blob":
                        continue
                    pth = row.get("path")
                    if isinstance(pth, str) and pth:
                        paths_out.append(pth.replace("\\", "/").strip("/"))
                if len(rows) < 100:
                    break
                page += 1
    except httpx.TimeoutException as e:
        log.warning("gitlab_tree_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_tree_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    return paths_out


async def commit_moves(
    *,
    repo_web_url: str,
    token: str,
    branch: str,
    moves: list[tuple[str, str]],
    message: str,
) -> tuple[str, str | None]:
    """GitLab commit with move actions only. moves: (previous_path, new_path)."""
    if not moves:
        return "", None
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    post_url = f"{origin}/api/v4/projects/{enc_p}/repository/commits"
    headers = {"PRIVATE-TOKEN": token.strip()}
    br = branch.strip() or "main"
    actions: list[dict[str, Any]] = []
    for prev_path, new_path in moves:
        p1 = prev_path.replace("\\", "/").strip("/")
        p2 = new_path.replace("\\", "/").strip("/")
        actions.append(
            {
                "action": "move",
                "previous_path": p1,
                "file_path": p2,
            }
        )
    body = {
        "branch": br,
        "commit_message": message.strip() or "Rename paths",
        "actions": actions,
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(post_url, headers=headers, json=body)
    except httpx.TimeoutException as e:
        log.warning("gitlab_commit_moves_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_commit_moves_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    if r.status_code not in (200, 201):
        detail = r.text[:500]
        log.warning(
            "gitlab_commit_moves_http_error status=%s body=%s",
            r.status_code,
            detail[:500],
        )
        raise ApiError(
            status_code=502,
            code="GITLAB_ERROR",
            message="GitLab returned an error.",
        )
    data = r.json()
    web_url = str(data.get("web_url") or "")
    sha = data.get("id") or data.get("short_id")
    short_sha = str(sha)[:12] if sha else None
    return web_url, short_sha


async def list_repo_tree(
    *,
    repo_web_url: str,
    token: str,
    branch: str,
    path: str = "",
) -> list[dict[str, Any]]:
    """Recursive GitLab repository tree; blobs only in output."""
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    url = f"{origin}/api/v4/projects/{enc_p}/repository/tree"
    headers = {"PRIVATE-TOKEN": token.strip()}
    br = branch.strip() or "main"
    prefix = path.replace("\\", "/").strip("/")
    paths_out: list[dict[str, Any]] = []
    page = 1
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            while True:
                params: dict[str, Any] = {
                    "path": prefix,
                    "ref": br,
                    "recursive": True,
                    "per_page": 100,
                    "page": page,
                }
                r = await client.get(url, headers=headers, params=params)
                if r.status_code == 404:
                    return []
                if r.status_code != 200:
                    log.warning(
                        "gitlab_tree_http_error status=%s body=%s",
                        r.status_code,
                        r.text[:300],
                    )
                    raise ApiError(
                        status_code=502,
                        code="GITLAB_ERROR",
                        message="GitLab returned an error.",
                    )
                rows = r.json()
                if not isinstance(rows, list) or not rows:
                    break
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    if row.get("type") != "blob":
                        continue
                    pth = row.get("path")
                    bid = row.get("id")
                    if isinstance(pth, str) and pth and bid:
                        paths_out.append(
                            {
                                "path": pth.replace("\\", "/").strip("/"),
                                "id": str(bid),
                                "name": str(row.get("name") or ""),
                            }
                        )
                if len(rows) < 100:
                    break
                page += 1
    except httpx.TimeoutException as e:
        log.warning("gitlab_tree_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_tree_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    return paths_out


async def fetch_blob(
    *,
    repo_web_url: str,
    token: str,
    ref: str,
    file_path: str,
) -> bytes:
    """Raw file bytes from repository at ``ref`` (branch name or commit SHA)."""
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    enc_f = _enc_file_path(file_path.replace("\\", "/").strip("/"))
    get_url = f"{origin}/api/v4/projects/{enc_p}/repository/files/{enc_f}/raw"
    headers = {"PRIVATE-TOKEN": token.strip()}
    params = {"ref": (ref.strip() or "main")}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.get(get_url, headers=headers, params=params)
    except httpx.TimeoutException as e:
        log.warning("gitlab_fetch_blob_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_fetch_blob_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    if r.status_code != 200:
        log.warning(
            "gitlab_fetch_blob_http_error status=%s body=%s",
            r.status_code,
            r.text[:200],
        )
        raise ApiError(
            status_code=502,
            code="GITLAB_ERROR",
            message="GitLab returned an error.",
        )
    return r.content


async def list_commits_since(
    *,
    repo_web_url: str,
    token: str,
    branch: str,
    since_iso8601: str | None = None,
    per_page: int = 100,
) -> list[dict[str, Any]]:
    """GitLab commits on ``branch`` optional ``since`` filter (ISO-8601)."""
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    url = f"{origin}/api/v4/projects/{enc_p}/repository/commits"
    headers = {"PRIVATE-TOKEN": token.strip()}
    pp = max(1, min(per_page, 100))
    params: dict[str, Any] = {
        "ref_name": branch.strip() or "main",
        "per_page": pp,
    }
    if since_iso8601:
        params["since"] = since_iso8601
    out: list[dict[str, Any]] = []
    page = 1
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            while True:
                params["page"] = page
                r = await client.get(url, headers=headers, params=params)
                if r.status_code != 200:
                    detail = r.text[:300]
                    log.warning(
                        "gitlab_list_commits_since_http_error status=%s body=%s",
                        r.status_code,
                        detail[:500],
                    )
                    raise ApiError(
                        status_code=502,
                        code="GITLAB_ERROR",
                        message="GitLab returned an error.",
                    )
                rows = r.json()
                if not isinstance(rows, list) or not rows:
                    break
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    out.append(
                        {
                            "id": row.get("id"),
                            "short_id": row.get("short_id"),
                            "title": row.get("title"),
                            "message": row.get("message"),
                            "author_name": (row.get("author_name") or "")
                            if isinstance(row.get("author_name"), str)
                            else "",
                            "created_at": row.get("created_at"),
                            "web_url": row.get("web_url"),
                        }
                    )
                if len(rows) < pp:
                    break
                page += 1
    except httpx.TimeoutException as e:
        log.warning("gitlab_list_commits_since_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_list_commits_since_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    return out


async def diff_paths_between(
    *,
    repo_web_url: str,
    token: str,
    from_sha: str,
    to_sha: str,
) -> list[str]:
    """Paths touched between two SHAs (GitLab compare API)."""
    origin, project_path = parse_gitlab_web_url(repo_web_url)
    if not origin or not project_path:
        raise ValueError("Invalid Git repository URL")
    enc_p = _enc_project_path(project_path)
    cmp_url = f"{origin}/api/v4/projects/{enc_p}/repository/compare"
    headers = {"PRIVATE-TOKEN": token.strip()}
    params = {"from": from_sha.strip(), "to": to_sha.strip()}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.get(cmp_url, headers=headers, params=params)
    except httpx.TimeoutException as e:
        log.warning("gitlab_compare_timeout: %s", type(e).__name__)
        raise ApiError(
            status_code=504,
            code="GITLAB_TRANSPORT_ERROR",
            message="GitLab did not respond in time.",
        ) from e
    except httpx.RequestError as e:
        log.warning("gitlab_compare_transport: %s", type(e).__name__)
        raise ApiError(
            status_code=502,
            code="GITLAB_TRANSPORT_ERROR",
            message="Could not reach GitLab.",
        ) from e
    if r.status_code != 200:
        log.warning(
            "gitlab_compare_http_error status=%s body=%s",
            r.status_code,
            r.text[:300],
        )
        raise ApiError(
            status_code=502,
            code="GITLAB_ERROR",
            message="GitLab returned an error.",
        )
    data = r.json()
    diffs = data.get("diffs") if isinstance(data, dict) else None
    paths: set[str] = set()
    if not isinstance(diffs, list):
        return []
    for d in diffs:
        if not isinstance(d, dict):
            continue
        np = d.get("new_path")
        op = d.get("old_path")
        if isinstance(np, str) and np:
            paths.add(np.replace("\\", "/").strip("/"))
        if isinstance(op, str) and op:
            paths.add(op.replace("\\", "/").strip("/"))
    return sorted(paths)
