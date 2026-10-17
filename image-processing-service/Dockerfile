# syntax=docker/dockerfile:1.7
# Build with OCR support:  docker build --build-arg WITH_OCR=true -t image-processing-service .
ARG WITH_OCR=false

# ---- builder: resolve and install locked dependencies with uv ----
FROM python:3.14.8-slim-trixie AS builder
ARG WITH_OCR
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    EXTRAS=$([ "$WITH_OCR" = "true" ] && echo "--extra ocr" || true) && \
    uv sync --frozen --no-dev --no-install-project $EXTRAS

COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    EXTRAS=$([ "$WITH_OCR" = "true" ] && echo "--extra ocr" || true) && \
    uv sync --frozen --no-dev --no-editable $EXTRAS

# ---- runtime: slim, non-root ----
FROM python:3.14.8-slim-trixie AS runtime
ARG WITH_OCR
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH" \
    STORAGE_DIR=/app/data/images
RUN if [ "$WITH_OCR" = "true" ]; then \
        apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
        && rm -rf /var/lib/apt/lists/*; \
    fi \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home app \
    && mkdir -p /app/data/images && chown -R app:app /app/data
WORKDIR /app
COPY --from=builder --chown=app:app /app/.venv /app/.venv
USER app
VOLUME ["/app/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]
CMD ["uvicorn", "image_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
