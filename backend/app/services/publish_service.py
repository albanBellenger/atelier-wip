"""Compile project + work orders and push to GitLab (Slice 11)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.deps import ProjectAccess
from app.exceptions import ApiError
from app.models import Project, Section, WorkOrder
from app.security.field_encryption import decrypt_secret, fernet_configured
from app.services.conflict_service import ConflictService
from app.services.git_service import commit_files
from app.services.graph_service import GraphService

log = structlog.get_logger("atelier.publish")

_EXPORT_WO = frozenset({"backlog", "in_progress", "in_review"})


def _safe_section_path(s: Section) -> str:
    raw = (s.slug or "").strip()
    if not raw or not re.match(r"^[\w\-]+$", raw):
        raw = re.sub(r"[^\w\-]+", "-", (s.title or "section").lower()).strip("-")[
            :80
        ] or "section"
    return f"sections/{raw}.md"


def _wo_markdown(w: WorkOrder) -> str:
    lines = [
        f"# {w.title}",
        "",
        f"**Status:** {w.status}",
        f"**Phase:** {w.phase or ''}",
        "",
        "## Description",
        w.description or "",
        "",
    ]
    if w.implementation_guide:
        lines += ["## Implementation guide", w.implementation_guide, ""]
    if w.acceptance_criteria:
        lines += ["## Acceptance criteria", w.acceptance_criteria, ""]
    return "\n".join(lines)


@dataclass(frozen=True)
class PublishResult:
    commit_url: str
    commit_sha: str | None
    files_committed: int


class PublishService:
    def __init__(self, db) -> None:
        self.db = db

    async def build_file_map(self, project_id: uuid.UUID) -> dict[str, str]:
        project = await self.db.get(Project, project_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )

        sec_row = await self.db.execute(
            select(Section)
            .where(Section.project_id == project_id)
            .order_by(Section.order)
        )
        sections = list(sec_row.scalars().all())

        files: dict[str, str] = {}
        toc_rows: list[str] = []
        for s in sections:
            rel = _safe_section_path(s)
            files[rel] = (s.content or "").rstrip() + "\n"
            toc_rows.append(f"| {s.title} | `{rel}` |")

        wo_stmt = (
            select(WorkOrder)
            .where(WorkOrder.project_id == project_id)
            .options(selectinload(WorkOrder.sections))
        )
        work_orders = list((await self.db.execute(wo_stmt)).scalars().unique().all())
        for w in work_orders:
            st = (w.status or "").lower().strip()
            if st not in _EXPORT_WO:
                continue
            path = f"work-orders/{w.id}.md"
            files[path] = _wo_markdown(w)

        readme = [
            f"# {project.name}",
            "",
            (project.description or "").strip(),
            "",
            "## Specification sections",
            "",
            "| Title | File |",
            "| --- | --- |",
            *toc_rows,
            "",
            f"_Exported at {datetime.now(timezone.utc).isoformat()}_",
            "",
        ]
        files["README.md"] = "\n".join(readme)
        return files

    async def publish(
        self,
        *,
        access: ProjectAccess,
        commit_message: str | None,
    ) -> PublishResult:
        if not access.studio_access.is_studio_editor:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio editor access required.",
            )
        software = access.software
        project = access.project
        if not software.git_repo_url or not software.git_branch:
            raise ApiError(
                status_code=400,
                code="GIT_NOT_CONFIGURED",
                message="Software git repository URL and branch are required.",
            )
        if not software.git_token:
            raise ApiError(
                status_code=400,
                code="GIT_NOT_CONFIGURED",
                message="Software git token is not set.",
            )
        if not fernet_configured():
            raise ApiError(
                status_code=500,
                code="ENCRYPTION_MISCONFIGURED",
                message="Server encryption key is not configured.",
            )
        plain = decrypt_secret(software.git_token)
        if not plain:
            raise ApiError(
                status_code=400,
                code="GIT_NOT_CONFIGURED",
                message="Could not read git token.",
            )

        files = await self.build_file_map(project.id)

        msg = (commit_message or "").strip() or f"Publish project {project.name}"
        actor = access.studio_access.user.id
        try:
            web_url, sha = await commit_files(
                repo_web_url=software.git_repo_url,
                token=plain,
                branch=software.git_branch or "main",
                files=files,
                message=msg,
            )
        except RuntimeError as e:
            raise ApiError(
                status_code=502,
                code="GITLAB_ERROR",
                message=str(e),
            ) from e
        except ValueError as e:
            raise ApiError(
                status_code=400,
                code="BAD_REQUEST",
                message=str(e),
            ) from e

        try:
            await ConflictService(self.db).run_conflict_analysis(
                project_id=project.id,
                run_actor_id=actor,
                origin="auto",
            )
            await GraphService(self.db).detect_section_relationships(
                project.id,
                context_user_id=actor,
            )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            log.exception(
                "post_publish_analysis_failed",
                project_id=str(project.id),
            )

        return PublishResult(
            commit_url=web_url or software.git_repo_url,
            commit_sha=sha,
            files_committed=len(files),
        )
