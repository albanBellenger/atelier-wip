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

Tool Admin configures provider, model, API keys, and optional OpenAI-compatible base URLs in **Admin → Settings** (`GET/PUT /admin/config`). Without this, LLM-dependent features return `503` with structured error codes.

## GitLab tokens

Studio members with access edit **Software → Git** settings. Tokens are encrypted at rest with `ENCRYPTION_KEY` (Fernet). Generate a key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## MCP API keys

Studio Admins create MCP keys in **Studio → Settings → MCP**. Only a **hash** of the key is stored; the raw key is shown **once** at creation.

## Cross-studio access

Studio Admins request access to another studio’s software; **Tool Admin** approves or denies in **Admin → Cross-studio**. See functional requirements for the full workflow.

## Token usage

Usage is recorded for LLM and MCP calls. Tool Admins and Studio Admins have dashboards described in the technical architecture (Slice 14).
