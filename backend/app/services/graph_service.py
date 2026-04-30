"""Knowledge graph edges and project graph assembly (Slice 9)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Artifact, GraphEdge, Issue, Section, WorkOrder
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService


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
                    select(Issue).where(Issue.project_id == project_id)
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

    async def detect_section_relationships(
        self,
        project_id: uuid.UUID,
        *,
        context_user_id: uuid.UUID,
    ) -> None:
        """LLM-detected directed section references → graph_edges (references)."""
        from app.models import Project, Software

        sec_row = await self.db.execute(
            select(Section).where(Section.project_id == project_id).order_by(Section.order)
        )
        sections = list(sec_row.scalars().all())
        if len(sections) < 2:
            return

        pr = await self.db.get(Project, project_id)
        if pr is None:
            return
        sw = await self.db.get(Software, pr.software_id)
        if sw is None:
            return

        ctx = TokenContext(
            studio_id=sw.studio_id,
            software_id=sw.id,
            project_id=project_id,
            user_id=context_user_id,
        )

        blocks: list[str] = []
        cap = 2400
        for i, s in enumerate(sections):
            body = (s.content or "").strip()
            if len(body) > cap:
                body = body[:cap] + "\n…"
            blocks.append(f"### Index {i}: {s.title}\n{body}\n")

        catalog = "\n".join(blocks)
        schema: dict[str, Any] = {
            "name": "section_refs",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "links": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "from_index": {"type": "integer"},
                                "to_index": {"type": "integer"},
                            },
                            "required": ["from_index", "to_index"],
                        },
                    }
                },
                "required": ["links"],
            },
        }
        llm = LLMService(self.db)
        prompt = (
            "Identify explicit cross-references between specification sections "
            "(dependencies, mentions of another section by name or concept). "
            "Return directed edges from_index → to_index using the indices given. "
            "Only include clear references; omit speculative links."
        )
        try:
            parsed = await llm.chat_structured(
                system_prompt=prompt,
                user_prompt=f"Sections:\n\n{catalog}",
                json_schema=schema,
                context=ctx,
                call_type="graph",
            )
        except ApiError:
            return

        links = []
        if isinstance(parsed, dict):
            links = parsed.get("links") or []
        if not isinstance(links, list):
            return

        n = len(sections)
        for item in links:
            if not isinstance(item, dict):
                continue
            a = item.get("from_index")
            b = item.get("to_index")
            if not isinstance(a, int) or not isinstance(b, int):
                continue
            if a < 0 or a >= n or b < 0 or b >= n or a == b:
                continue
            sid_a = sections[a].id
            sid_b = sections[b].id
            await self.add_edge(
                project_id=project_id,
                source_type="section",
                source_id=sid_a,
                target_type="section",
                target_id=sid_b,
                edge_type="references",
            )
        await self.db.flush()
