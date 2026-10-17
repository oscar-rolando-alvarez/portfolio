"""ASGI entrypoint: ``uvicorn ragplatform.api.main:app``."""

from ragplatform.api.app import create_app

app = create_app()
