# syntax=docker/dockerfile:1
# Local runtime image for the platform: runs the real Lambda handlers behind a
# local Kafka consumer, SQS pollers and an API Gateway shim (see
# src/fleetintel/local/runner.py). In AWS the same code ships as a Lambda zip.

# ---- build stage: resolve the locked dependency set into a virtualenv -------------
FROM python:3.13.16-slim-trixie@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f AS builder

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --group local --no-install-project

COPY README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --group local --no-editable

# ---- runtime stage: no build tools, non-root ---------------------------------------
FROM python:3.13.16-slim-trixie@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f AS runtime

LABEL org.opencontainers.image.title="iot-fleet-intelligence-platform" \
      org.opencontainers.image.source="https://github.com/oscar-rolando-alvarez/portfolio" \
      org.opencontainers.image.licenses="MIT"

RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder --chown=app:app /app/.venv /app/.venv

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POWERTOOLS_METRICS_DISABLED=true \
    POWERTOOLS_TRACE_DISABLED=true

USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2)"]

ENTRYPOINT ["fleetintel-local"]
