"""Publish / git history responses."""

from pydantic import BaseModel, Field


class PublishRequest(BaseModel):
    commit_message: str | None = Field(None, max_length=512)


class PublishResponse(BaseModel):
    commit_url: str
    commit_sha: str | None = None
    files_committed: int = 0


class GitCommitItem(BaseModel):
    model_config = {"extra": "ignore"}

    id: str | None = None
    short_id: str | None = None
    title: str | None = None
    message: str | None = None
    author_name: str = ""
    created_at: str | None = None
    web_url: str | None = None


class GitHistoryResponse(BaseModel):
    commits: list[GitCommitItem]
