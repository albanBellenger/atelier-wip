"""Minimal GitLab REST checks for Slice 2 (no publish pipeline)."""

from urllib.parse import quote, urlparse

import httpx


def parse_gitlab_web_url(repo_url: str) -> tuple[str | None, str | None]:
    """Return (api_origin, project_path) e.g. ('https://gitlab.com', 'group/repo')."""
    raw = repo_url.strip()
    if not raw:
        return None, None
    u = urlparse(raw)
    if not u.scheme or not u.netloc:
        return None, None
    path = u.path.strip("/")
    if path.endswith(".git"):
        path = path[: -4]
    if not path:
        return None, None
    origin = f"{u.scheme}://{u.netloc}"
    return origin, path


async def test_gitlab_connection(
    repo_url: str,
    token: str,
    branch: str,
) -> tuple[bool, str]:
    """Verify token can read commits on branch via GitLab API v4."""
    origin, project_path = parse_gitlab_web_url(repo_url)
    if not origin or not project_path:
        return False, "Invalid or empty Git repository URL"
    if not token.strip():
        return False, "Git token is required"
    enc = quote(project_path, safe="")
    api_url = f"{origin}/api/v4/projects/{enc}/repository/commits"
    headers = {"PRIVATE-TOKEN": token.strip()}
    params = {"ref_name": branch.strip() or "main", "per_page": 1}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(api_url, headers=headers, params=params)
    except httpx.RequestError as e:
        return False, f"Network error: {e!s}"
    if r.status_code == 200:
        return True, "GitLab connection OK"
    if r.status_code == 401:
        return False, "GitLab rejected the token (401)"
    if r.status_code == 404:
        return False, "Project or branch not found (404)"
    return False, f"GitLab API error ({r.status_code})"
