"""Knowledge graph edges and project graph assembly (Slice 9)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artifact, GraphEdge, Issue, Project, Section, WorkOrder


def node_id(entity_type: str, entity_uuid: uuid.UUID) -> str:
    return f"{entity_type}:{entity_uuid}"


class GraphService:
    """Persist typed edges and assemble force-graph payloads."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add_edge(
        self,
        *,
        project_id: uuid.UUID,
        source_type: str,
        source_id: uuid.UUID,
        target_type: str,
        target_id: uuid.UUID,
        edge_type: str,
    ) -> None:
        existing = await self.db.execute(
            select(GraphEdge.id).where(
                GraphEdge.project_id == project_id,
                GraphEdge.source_type == source_type,
                GraphEdge.source_id == source_id,
                GraphEdge.target_type == target_type,
                GraphEdge.target_id == target_id,
                GraphEdge.edge_type == edge_type,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return
        self.db.add(
            GraphEdge(
                id=uuid.uuid4(),
                project_id=project_id,
                source_type=source_type,
                source_id=source_id,
                target_type=target_type,
                target_id=target_id,
                edge_type=edge_type,
            )
        )

    async def get_graph(self, project_id: uuid.UUID) -> dict[str, Any]:
        """Nodes + edges for react-force-graph (string ids)."""
        nodes: list[dict[str, Any]] = []

        proj = await self.db.get(Project, project_id)
        if proj is None:
            return {"nodes": [], "edges": []}
        software_id = proj.software_id

        secs = (
            (
                await self.db.execute(
                    select(Section).where(Section.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        for s in secs:
            nodes.append(
                {
                    "id": node_id("section", s.id),
                    "entity_type": "section",
                    "entity_id": str(s.id),
                    "label": s.title[:200],
                    "stale": False,
                }
            )

        doc_secs = (
            (
                await self.db.execute(
                    select(Section).where(
                        Section.software_id == software_id,
                        Section.project_id.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        for s in doc_secs:
            nodes.append(
                {
                    "id": node_id("software_doc_section", s.id),
                    "entity_type": "software_doc_section",
                    "entity_id": str(s.id),
                    "label": s.title[:200],
                    "stale": False,
                }
            )

        wos = (
            (
                await self.db.execute(
                    select(WorkOrder).where(WorkOrder.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        for w in wos:
            nodes.append(
                {
                    "id": node_id("work_order", w.id),
                    "entity_type": "work_order",
                    "entity_id": str(w.id),
                    "label": w.title[:200],
                    "stale": w.is_stale,
                }
            )

        arts = (
            (
                await self.db.execute(
                    select(Artifact).where(Artifact.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        for a in arts:
            nodes.append(
                {
                    "id": node_id("artifact", a.id),
                    "entity_type": "artifact",
                    "entity_id": str(a.id),
                    "label": a.name[:200],
                }
            )

        issues = (
            (
                await self.db.execute(
                    select(Issue).where(
                        or_(
                            Issue.project_id == project_id,
                            and_(
                                Issue.software_id == software_id,
                                or_(
                                    Issue.project_id.is_(None),
                                    Issue.project_id == project_id,
                                ),
                            ),
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        for issue_row in issues:
            desc = (issue_row.description or "").strip().replace("\n", " ")
            nodes.append(
                {
                    "id": node_id("issue", issue_row.id),
                    "entity_type": "issue",
                    "entity_id": str(issue_row.id),
                    "label": (desc[:50] + "…") if len(desc) > 50 else desc or "Issue",
                    "status": issue_row.status,
                    "issue_kind": issue_row.kind,
                }
            )

        edges_out: list[dict[str, Any]] = []
        edges = (
            (
                await self.db.execute(
                    select(GraphEdge).where(GraphEdge.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        for e in edges:
            edges_out.append(
                {
                    "source": node_id(e.source_type, e.source_id),
                    "target": node_id(e.target_type, e.target_id),
                    "edge_type": e.edge_type,
                }
            )

        return {"nodes": nodes, "edges": edges_out}
