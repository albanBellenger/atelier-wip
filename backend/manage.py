"""Sysadmin CLI: emergency Tool Admin recovery and admin listing."""

import secrets
import string
import uuid

import click
from click.core import ParameterSource
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models.user import User
from app.security.passwords import hash_password


def _sync_database_url(url: str) -> str:
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "+psycopg", 1)
    return url


def _generate_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _default_display_name(email: str) -> str:
    local = email.split("@", 1)[0].strip() or "Admin"
    return local[:255]


@click.group()
def cli() -> None:
    pass


@cli.command("create-admin")
@click.option("--email", required=True, type=str)
@click.option("--password", default=None, required=False, type=str)
@click.pass_context
def create_admin(ctx: click.Context, email: str, password: str | None) -> None:
    """Grant Tool Admin to a user by email (create user if missing)."""
    email_norm = email.lower().strip()
    password_explicit = (
        ctx.get_parameter_source("password") == ParameterSource.COMMANDLINE
    )
    if password_explicit and (password is None or password == ""):
        raise click.UsageError("--password cannot be empty when provided.")

    settings = get_settings()
    sync_url = _sync_database_url(settings.database_url)
    engine = create_engine(sync_url, pool_pre_ping=True)
    session_factory = sessionmaker(
        engine, class_=Session, expire_on_commit=False, autoflush=False
    )

    generated_password: str | None = None

    with session_factory() as session:
        user = session.scalar(select(User).where(User.email == email_norm))
        if user is None:
            if password_explicit:
                plain = password
            else:
                plain = _generate_password(16)
                generated_password = plain
            assert plain is not None
            session.add(
                User(
                    id=uuid.uuid4(),
                    email=email_norm,
                    password_hash=hash_password(plain),
                    display_name=_default_display_name(email_norm),
                    is_tool_admin=True,
                )
            )
        else:
            user.is_tool_admin = True
            if password_explicit:
                assert password is not None
                user.password_hash = hash_password(password)
        session.commit()

    click.echo(f"Tool Admin status granted to {email_norm}.")
    if generated_password is not None:
        click.echo(
            f"Generated password: {generated_password} — change this immediately."
        )


@cli.command("list-admins")
def list_admins() -> None:
    """List all users with Tool Admin role."""
    settings = get_settings()
    sync_url = _sync_database_url(settings.database_url)
    engine = create_engine(sync_url, pool_pre_ping=True)
    session_factory = sessionmaker(
        engine, class_=Session, expire_on_commit=False, autoflush=False
    )

    headers = ("id", "email", "display_name", "created_at")
    with session_factory() as session:
        users = session.scalars(
            select(User).where(User.is_tool_admin.is_(True)).order_by(User.created_at)
        ).all()

    rows: list[tuple[str, str, str, str]] = [
        (str(u.id), u.email, u.display_name, str(u.created_at)) for u in users
    ]

    col_widths = [len(h) for h in headers]
    for r in rows:
        for i, cell in enumerate(r):
            col_widths[i] = max(col_widths[i], len(cell))

    def _fmt(cells: tuple[str, ...]) -> str:
        return " | ".join(c.ljust(col_widths[i]) for i, c in enumerate(cells))

    click.echo(_fmt(headers))
    click.echo("-+-".join("-" * col_widths[i] for i in range(len(headers))))
    for r in rows:
        click.echo(_fmt(r))


if __name__ == "__main__":
    cli()
