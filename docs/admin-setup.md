# Admin setup

## Tool Admin (first user)

The **first registered user** in an empty database becomes Tool Admin. Use `/auth/register` from the UI or API, then sign in.

If all Tool Admin accounts are lost, use the emergency CLI on a shell with database access:

```bash
cd backend
set DATABASE_URL=postgresql+asyncpg://…
python manage.py create-admin --email admin@example.com
```

See [README.md](../README.md#emergency-recovery) for details.

## LLM and embeddings

**LLM inference** (provider keys, models, optional OpenAI-compatible base URLs) is configured in **Admin → Console → LLM** via the provider registry API (`/admin/llm/...`). Chat and structured calls resolve credentials from the **default** registry row (and routing rules where applicable). Without a configured default provider and API key, LLM-dependent features return `503` with structured error codes such as `LLM_NOT_CONFIGURED`.

**Embeddings** resolve like chat LLMs: Tool Admin configures provider rows and an **embeddings** routing rule in **Admin → Console → LLM** (`/admin/llm/providers`, `/admin/llm/routing`). Optional catalog metadata, library coverage, reindex policy, and the embedding probe live under **Admin → Console → Embeddings**. Observed vector width is stored in `embedding_dimension_state` (singleton). The legacy `GET/PUT /admin/config` paths still return **404**.

## GitLab tokens

Studio Builders and Studio Owners with access edit **Software → Git** settings. Tokens are encrypted at rest with `ENCRYPTION_KEY` (Fernet). Generate a key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## MCP API keys

Studio Owners create MCP keys in **Studio → Settings → MCP**. Only a **hash** of the key is stored; the raw key is shown **once** at creation.

## Cross-studio access

Studio Owners request access to another studio’s software; **Tool Admin** approves or denies in **Admin → Cross-studio**. See functional requirements for the full workflow.

## Token usage

Usage is recorded for LLM and MCP calls. Tool Admins and Studio Owners have dashboards described in the technical architecture (Slice 14).
