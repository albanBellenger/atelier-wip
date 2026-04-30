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
