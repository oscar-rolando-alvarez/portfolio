"""Operational CLI: ``ragplatform serve | worker | migrate | evaluate | ask | dev-token | create-api-key``."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Annotated

import typer

from ragplatform.config import get_settings

app = typer.Typer(no_args_is_help=True, add_completion=False, help=__doc__)

_SRC_ROOT = Path(__file__).resolve().parents[2]
ROOT = _SRC_ROOT if (_SRC_ROOT / "alembic.ini").exists() else Path.cwd()


@app.command()
def serve(
    host: str = "0.0.0.0",  # noqa: S104 - container entrypoint
    port: int = 8000,
    workers: int = 1,
) -> None:
    """Run the HTTP API."""
    import uvicorn

    uvicorn.run(
        "ragplatform.api.main:app",
        host=host,
        port=port,
        workers=workers,
        proxy_headers=True,
        log_config=None,
    )


@app.command()
def worker() -> None:
    """Run the ingestion worker (Postgres queue)."""
    from ragplatform.container import build_container
    from ragplatform.observability.telemetry import configure_logging, configure_telemetry

    settings = get_settings()
    configure_logging(settings.log_level)
    configure_telemetry(settings)

    async def _run() -> None:
        container = build_container(settings)
        try:
            await container.worker.run_forever()
        finally:
            await container.aclose()

    asyncio.run(_run())


@app.command()
def migrate(revision: str = "head") -> None:
    """Apply database migrations."""
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(ROOT / "alembic.ini")), revision)


@app.command("evaluate")
def run_eval(
    golden: Annotated[Path, typer.Option(help="Golden dataset (JSONL)")] = ROOT
    / "evals/golden.jsonl",
    corpus: Annotated[Path, typer.Option(help="Corpus directory")] = ROOT / "evals/corpus",
    thresholds: Annotated[Path, typer.Option()] = ROOT / "evals/thresholds.json",
    k: int = 5,
    judge: Annotated[str, typer.Option(help="none | llm")] = "none",
    report: Annotated[Path | None, typer.Option(help="Write JSON report here")] = None,
) -> None:
    """Run the offline eval harness; exits non-zero when a threshold is missed."""
    from ragplatform.container import build_container
    from ragplatform.evals.runner import EvalRunner, load_golden
    from ragplatform.observability.telemetry import configure_logging

    settings = get_settings()
    configure_logging("WARNING")

    async def _run() -> bool:
        container = build_container(settings)
        try:
            runner = EvalRunner(container, k=k, judge=judge)
            await runner.ingest_corpus(corpus)
            result = await runner.run(load_golden(golden), json.loads(thresholds.read_text()))
        finally:
            await container.aclose()
        if report:
            report.write_text(result.to_json())
        typer.echo(f"backend={result.backend} llm={result.llm_model} items={result.items} k={k}")
        for name, value in result.metrics.items():
            typer.echo(f"  {name:<24} {value}")
        bad = [
            r
            for r in result.results
            if not r.refusal_correct or r.answer_correct is False or r.acl_leak or r.forbidden_hits
        ]
        for r in bad:
            typer.echo(
                f"  ! {r.id}: refused={r.refused} ({r.refusal_reason}) answer={r.answer[:120]!r}"
            )
        for f in result.failures:
            typer.echo(f"FAIL {f}", err=True)
        typer.echo("PASSED" if result.passed else "FAILED")
        return result.passed

    if not asyncio.run(_run()):
        raise typer.Exit(code=1)


@app.command()
def ask(
    question: str,
    tenant: str = "demo",
    groups: str = "",
    corpus: Path = ROOT / "evals/corpus",
) -> None:
    """Zero-setup demo: ingest the sample corpus in memory and answer a question."""
    from ragplatform.adapters.memory.store import InMemoryStore
    from ragplatform.container import build_container
    from ragplatform.domain.models import Principal, Role
    from ragplatform.generation.service import answer_to_dict
    from ragplatform.observability.telemetry import configure_logging

    configure_logging("WARNING")
    settings = get_settings()

    async def _run() -> None:
        container = build_container(settings, memory_store=InMemoryStore())
        admin = Principal(tenant, "cli", frozenset(), frozenset({Role.ADMIN.value}))
        manifest = json.loads((corpus / "manifest.json").read_text())
        for entry in manifest["documents"]:
            if entry.get("tenant"):
                continue
            path = corpus / entry["file"]
            await container.ingestion.submit(
                admin,
                data=path.read_bytes(),
                filename=path.name,
                mime_type=None,
                external_id=entry["external_id"],
                acl_groups=entry["acl_groups"],
            )
        await container.worker.drain()
        user = Principal(tenant, "cli-user", frozenset(g for g in groups.split(",") if g))
        answer = await container.answers.answer(user, question)
        typer.echo(json.dumps(answer_to_dict(answer), indent=2))

    asyncio.run(_run())


@app.command("dev-token")
def dev_token(
    tenant: str = "acme",
    subject: str = "alice@example.com",
    groups: str = "engineering",
    roles: str = "editor",
    ttl: int = 3600,
) -> None:
    """Mint a local HS256 JWT (disabled unless RAG_ALLOW_DEV_TOKENS=true)."""
    from ragplatform.api.auth import mint_token

    settings = get_settings()
    if not settings.allow_dev_tokens:
        typer.echo("dev tokens are disabled (RAG_ALLOW_DEV_TOKENS=false)", err=True)
        raise typer.Exit(code=2)
    typer.echo(
        mint_token(
            settings,
            tenant_id=tenant,
            subject=subject,
            groups=[g for g in groups.split(",") if g],
            roles=[r for r in roles.split(",") if r],
            ttl_s=ttl,
        )
    )


@app.command("create-api-key")
def create_api_key(
    tenant: str,
    name: str,
    groups: str = "",
    roles: str = "reader",
) -> None:
    """Create a hashed API key in the database and print the plaintext once."""
    from ragplatform.api.auth import Authenticator
    from ragplatform.container import build_container

    settings = get_settings()
    if settings.resolved_database_url is None:
        typer.echo("RAG_DATABASE_URL is required", err=True)
        raise typer.Exit(code=2)

    async def _run() -> str:
        container = build_container(settings)
        try:
            return await Authenticator(settings, container.api_keys).create_api_key(
                tenant_id=tenant,
                name=name,
                groups=[g for g in groups.split(",") if g],
                roles=[r for r in roles.split(",") if r],
            )
        finally:
            await container.aclose()

    sys.stdout.write(asyncio.run(_run()) + "\n")


if __name__ == "__main__":  # pragma: no cover
    app()
