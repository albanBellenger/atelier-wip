"""Knowledge graph API schemas."""

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    model_config = {"extra": "ignore"}

    id: str = Field(description="Composite id e.g. section:<uuid>")
    entity_type: str
    entity_id: str
    label: str
    stale: bool | None = None
    status: str | None = None
    issue_kind: str | None = None


class GraphEdgeOut(BaseModel):
    source: str
    target: str
    edge_type: str


class ProjectGraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdgeOut]


class GraphAnalyzeResponse(BaseModel):
    ok: bool = True
    message: str
