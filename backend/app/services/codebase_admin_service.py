"""Platform-admin overview of indexed software codebases (GitLab snapshots)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CodebaseChunk, CodebaseFile, CodebaseSnapshot, CodebaseSymbol, Software, Studio
from app.schemas.admin_console import AdminCodebaseSoftwareRow, AdminCodebaseStudioResponse
from app.services.codebase_service import CodebaseService


class CodebaseAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def overview(self) -> list[AdminCodebaseStudioResponse]:
        studios = list(
            (await self.db.execute(select(Studio).order_by(Studio.name))).scalars().all()
        )
        codebase_svc = CodebaseService(self.db)
        out: list[AdminCodebaseStudioResponse] = []
        for st in studios:
            software_rows = list(
                (
                    await self.db.execute(
                        select(Software).where(Software.studio_id == st.id).order_by(Software.name)
                    )
                )
                .scalars()
                .all()
            )
            sw_out: list[AdminCodebaseSoftwareRow] = []
            for sw in software_rows:
                git_configured = bool(sw.git_repo_url and sw.git_branch and sw.git_token)
                newest = (
                    await self.db.scalars(
                        select(CodebaseSnapshot)
                        .where(CodebaseSnapshot.software_id == sw.id)
                        .order_by(CodebaseSnapshot.created_at.desc())
                        .limit(1)
                    )
                ).first()
                newest_status = newest.status if newest is not None else "none"
                ready = await codebase_svc.get_ready_snapshot(sw.id)
                n_files = n_chunks = n_symbols = 0
                commit_sha = branch = None
                ready_at = None
                if ready is not None:
                    commit_sha = ready.commit_sha
                    branch = ready.branch
                    ready_at = ready.ready_at
                    n_files = int(
                        await self.db.scalar(
                            select(func.count())
                            .select_from(CodebaseFile)
                            .where(CodebaseFile.snapshot_id == ready.id)
                        )
                        or 0
                    )
                    n_chunks = int(
                        await self.db.scalar(
                            select(func.count())
                            .select_from(CodebaseChunk)
                            .where(CodebaseChunk.snapshot_id == ready.id)
                        )
                        or 0
                    )
                    n_symbols = int(
                        await self.db.scalar(
                            select(func.count())
                            .select_from(CodebaseSymbol)
                            .where(CodebaseSymbol.snapshot_id == ready.id)
                        )
                        or 0
                    )
                sw_out.append(
                    AdminCodebaseSoftwareRow(
                        software_id=sw.id,
                        software_name=sw.name,
                        git_configured=git_configured,
                        ready_file_count=n_files,
                        ready_chunk_count=n_chunks,
                        ready_symbol_count=n_symbols,
                        commit_sha=commit_sha,
                        branch=branch,
                        ready_at=ready_at,
                        newest_snapshot_status=newest_status,
                    )
                )
            out.append(
                AdminCodebaseStudioResponse(
                    studio_id=st.id,
                    studio_name=st.name,
                    software=sw_out,
                )
            )
        return out
