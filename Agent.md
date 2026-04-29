# Atelier — Agent Guide
# Place this file at: agent.md (monorepo root)

You are an AI coding agent working on **Atelier** — a collaborative software specification platform built for engineering studios. This document is your operating manual. Read it fully before writing any code.

---

## What Atelier Is

Atelier allows software studios to collaboratively write structured specs, generate Work Orders from those specs, and publish everything to a self-hosted GitLab repository for consumption by coding agents (like you) via MCP.

The platform is organised in a strict hierarchy:
```
Tool (global) → Studio → Software → Project → Work Order
```

Studios are isolated from each other (Chinese wall). Cross-studio access requires explicit Tool Admin approval.

---

## Architecture Documents

Before making any structural decision, read:
- `docs/atelier-functional-requirements.md` — what the system does
- `docs/atelier-technical-architecture.md` — how it is built

These are the ground truth. If your task contradicts them, flag it — do not silently deviate.

---

## Monorepo Layout

```
atelier/
├── backend/                  # Python / FastAPI
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── config.py         # Settings via pydantic-settings
│   │   ├── database.py       # SQLAlchemy async engine + session
│   │   ├── models/           # SQLAlchemy ORM models (one file per table group)
│   │   ├── schemas/          # Pydantic v2 request/response schemas
│   │   ├── routers/          # FastAPI route handlers (thin — logic in services)
│   │   ├── services/         # Business logic
│   │   │   ├── llm_service.py
│   │   │   ├── rag_service.py
│   │   │   ├── drift_service.py
│   │   │   ├── conflict_service.py
│   │   │   ├── graph_service.py
│   │   │   ├── publish_service.py
│   │   │   └── git_service.py
│   │   ├── websockets/       # Yjs collab + project chat WS handlers
│   │   └── middleware/       # JWT auth + RBAC dependencies
│   ├── tests/
│   │   ├── conftest.py       # Fixtures, test DB session, factories
│   │   ├── factories.py      # factory-boy model factories
│   │   ├── unit/             # Pure logic tests, no DB, no HTTP
│   │   ├── integration/      # Real DB (rolled-back tx), real HTTP via httpx
│   │   └── llm/              # @pytest.mark.llm — real API calls, nightly only
│   ├── alembic/              # Database migrations
│   └── requirements.txt
├── frontend/                 # React + TypeScript + Tailwind
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useStudioAccess.ts   # RBAC hook — always use this for permissions
│       │   ├── useStream.ts         # SSE streaming for LLM responses
│       │   └── useWebSocket.ts
│       ├── services/
│       │   ├── api.ts               # All REST calls go here
│       │   └── ws.ts                # All WebSocket connections go here
│       └── tests/
│           ├── mocks/               # MSW handlers + fixtures
│           ├── unit/
│           └── components/
├── e2e/                      # Playwright E2E tests
│   ├── pages/                # Page Object Model
│   └── specs/
├── docs/                     # Architecture documents
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.test.yml
└── .gitlab-ci.yml
```

---

## How to Work on a Feature (TDD Order)

Every feature follows this order. Do not skip steps.

```
1. Read the relevant section in the functional requirements and architecture docs
2. Write a failing unit test for the service logic
3. Write a failing integration test for the API route
4. Implement the service + route until all tests pass
5. Write the frontend component test (MSW mocks the API)
6. Implement the React component until the test passes
7. Write the Playwright E2E test for the happy path + key edge cases
8. If the feature involves LLM calls → write a @pytest.mark.llm test
9. Refactor with confidence — all tests must stay green
```

---

## Backend Patterns

### Route handler (thin)
```python
# routers/work_orders.py
@router.post("/projects/{project_id}/work-orders", response_model=WorkOrderResponse)
async def create_work_order(
    project_id: UUID,
    body: WorkOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_studio_member),   # RBAC — always use deps
):
    return await WorkOrderService(db).create(project_id, body, current_user)
```

### Service class
```python
# services/work_order_service.py
class WorkOrderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self, project_id: UUID, body: WorkOrderCreate, user: User
    ) -> WorkOrderResponse:
        # All business logic here
        ...
```

### RBAC dependencies — always use, never bypass
```python
# middleware/auth.py
async def require_studio_member(
    studio_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    membership = await db.get(StudioMember, (studio_id, current_user.id))
    if not membership:
        raise HTTPException(status_code=403)
    return current_user
```

### LLM calls — always through LLMService
```python
# For conversational (streaming) calls:
async for token in await llm_service.chat_stream(messages, system_prompt, call_type, ctx):
    yield token

# For structured generation (Work Orders, conflict, drift):
result = await llm_service.chat_structured(
    messages=messages,
    system_prompt=system_prompt,
    call_type="work_order_gen",
    context=ctx,
    output_schema=WORK_ORDER_SCHEMA   # always provide — never parse free text
)
```

### Yjs persistence — always dual-write
```python
# websockets/collab.py (on debounced save)
import y_py as Y  # or equivalent Yjs Python binding

doc_state: bytes = Y.encode_state_as_update(yjs_doc)   # binary blob
plain_text: str = yjs_doc.get_text("content").to_string()

await db.execute(
    update(Section)
    .where(Section.id == section_id)
    .values(
        yjs_state=doc_state,   # CRDT source of truth — never omit this
        content=plain_text,    # RAG source of truth
        updated_at=func.now(),
    )
)
```

### File downloads — always proxy, never presigned URLs
```python
# routers/artifacts.py
@router.get("/projects/{pid}/artifacts/{aid}/download")
async def download_artifact(
    aid: UUID,
    current_user: User = Depends(require_studio_member),
    db: AsyncSession = Depends(get_db),
):
    artifact = await ArtifactService(db).get(aid)
    stream = minio_client.get_object(BUCKET, artifact.storage_path)
    return StreamingResponse(
        stream,
        media_type=artifact.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{artifact.name}"'}
    )
```

### Error responses — always structured
```python
raise HTTPException(
    status_code=404,
    detail={"detail": "Section not found", "code": "SECTION_NOT_FOUND"}
)
```

---

## Database Patterns

### Migrations
```bash
# Always create a new migration — never edit existing ones
alembic revision --autogenerate -m "add yjs_state to sections"
alembic upgrade head
```

### pgvector indexes — always HNSW
```sql
-- CORRECT
CREATE INDEX ON artifact_chunks USING hnsw (embedding vector_cosine_ops);

-- NEVER use this
CREATE INDEX ON artifact_chunks USING ivfflat (embedding vector_cosine_ops);
```

### Queries — always explicit columns
```python
# CORRECT
result = await db.execute(
    select(Section.id, Section.title, Section.content, Section.slug)
    .where(Section.project_id == project_id)
    .order_by(Section.order)
)

# WRONG
result = await db.execute(select(Section))  # never SELECT *
```

---

## Frontend Patterns

### API calls — always through api.ts
```typescript
// CORRECT
import { api } from '@/services/api'
const workOrders = await api.get(`/projects/${projectId}/work-orders`)

// WRONG
const workOrders = await fetch(`/projects/${projectId}/work-orders`)
```

### Permissions — always use useStudioAccess
```tsx
// CORRECT
const { canEdit, canPublish, isStudioAdmin } = useStudioAccess()
return canEdit ? <EditButton /> : null

// WRONG — never hide with CSS, never hardcode role strings
return <EditButton className={canEdit ? '' : 'hidden'} />
```

### Streaming LLM — always use useStream
```tsx
// CORRECT
const { content, isStreaming } = useStream(
  `/projects/${projectId}/sections/${sectionId}/thread/messages`,
  { method: 'POST', body: { message } }
)

// WRONG — never manage EventSource manually in a component
```

### React Query for server state
```tsx
// CORRECT
const { data: workOrders } = useQuery({
  queryKey: ['work-orders', projectId],
  queryFn: () => api.get(`/projects/${projectId}/work-orders`)
})

// WRONG
const [workOrders, setWorkOrders] = useState([])
useEffect(() => { fetch(...).then(setWorkOrders) }, [])
```

---

## Testing Patterns

### Integration test structure
```python
async def test_create_work_order_happy_path(client, studio_member, project):
    # ARRANGE
    section = await SectionFactory.create(project_id=project["id"])

    # ACT
    response = await client.post(
        f"/projects/{project['id']}/work-orders",
        json={"title": "Build auth", "description": "...", "section_ids": [str(section.id)]},
        headers=studio_member["headers"],
    )

    # ASSERT
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Build auth"
    assert data["status"] == "backlog"

async def test_create_work_order_viewer_forbidden(client, viewer, project):
    response = await client.post(
        f"/projects/{project['id']}/work-orders",
        json={"title": "Build auth", "description": "..."},
        headers=viewer["headers"],
    )
    assert response.status_code == 403

async def test_create_work_order_cross_studio_forbidden(client, other_studio_member, project):
    response = await client.post(
        f"/projects/{project['id']}/work-orders",
        json={"title": "Build auth", "description": "..."},
        headers=other_studio_member["headers"],
    )
    assert response.status_code == 403
```

### LLM test assertions — key presence + semantic, never string length
```python
@pytest.mark.llm
async def test_work_order_gen_structure(client, studio_member, section_with_content):
    response = await client.post(
        f"/projects/{section_with_content['project_id']}/work-orders/generate",
        json={"section_ids": [section_with_content["id"]]},
        headers=studio_member["headers"],
    )
    assert response.status_code == 201
    for wo in response.json():
        assert isinstance(wo["title"], str) and wo["title"]        # present + non-empty
        assert isinstance(wo["description"], str) and wo["description"]
        assert isinstance(wo["acceptance_criteria"], str)
        assert wo["status"] == "backlog"
        # NEVER: assert len(wo["title"]) < 100
```

### Frontend component test
```tsx
// WorkOrderCard.test.tsx
describe('WorkOrderCard', () => {
  it('renders title and status', async () => {
    render(<WorkOrderCard workOrderId="wo-1" />)
    expect(await screen.findByText('Build auth')).toBeInTheDocument()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
  })

  it('shows stale badge when work order is stale', async () => {
    server.use(http.get('/projects/*/work-orders/wo-1', () =>
      HttpResponse.json({ ...fixture, is_stale: true })
    ))
    render(<WorkOrderCard workOrderId="wo-1" />)
    expect(await screen.findByTestId('stale-badge')).toBeInTheDocument()
  })

  it('hides edit button for viewer', () => {
    renderWithRole(<WorkOrderCard workOrderId="wo-1" />, 'viewer')
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
```

---

## Running the Project

```bash
# Start full dev stack
docker compose -f docker-compose.dev.yml up

# Backend only (with hot reload)
cd backend && uvicorn app.main:app --reload

# Run backend unit + integration tests
cd backend && pytest tests/unit tests/integration -v

# Run backend unit tests only (fast)
cd backend && pytest tests/unit -v

# Run LLM regression tests (costs tokens)
cd backend && pytest tests/llm -v -m llm

# Run frontend tests
cd frontend && npm test

# Run E2E tests (requires full stack running)
npx playwright test

# Create a new DB migration
cd backend && alembic revision --autogenerate -m "description"
cd backend && alembic upgrade head
```

---

## Key Things to Never Do

| Never | Instead |
|---|---|
| Call LLM SDK directly | Use `LLMService.chat_stream()` or `chat_structured()` |
| Generate presigned MinIO URLs for downloads | Proxy through FastAPI `StreamingResponse` |
| Use `ivfflat` pgvector index | Use `hnsw` |
| Save only `sections.content` on Yjs debounce | Always dual-write `yjs_state` + `content` |
| Skip RBAC dependencies in routes | Always use `require_studio_member` / `require_studio_admin` |
| Return SQLAlchemy model from API endpoint | Use a Pydantic response schema |
| Write implementation before tests | Write failing test first |
| Delete a test to make a build pass | Fix the implementation |
| Edit an existing Alembic migration | Create a new one |
| Use `any` in TypeScript | Use proper types |
| Call `fetch` directly in a component | Use `api.ts` |
| Hide unauthorised elements with CSS | Remove them from the DOM |
| Assert `len(string) < N` in LLM tests | Assert key presence + semantic relevance |
| Use `SELECT *` in queries | Always select explicit columns |
| Deviate from the architecture docs | Flag it and discuss first |