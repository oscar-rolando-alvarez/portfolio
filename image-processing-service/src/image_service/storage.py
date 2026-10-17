"""Storage port with a local filesystem adapter (content-addressed, traversal-safe)."""

from __future__ import annotations

import asyncio
import hashlib
import re
from pathlib import Path
from typing import Protocol

_KEY = re.compile(r"^[a-f0-9]{64}\.(jpeg|png|webp|gif|bmp|tiff)$")


class Storage(Protocol):
    async def put(self, data: bytes, extension: str) -> str: ...

    async def get(self, key: str) -> bytes | None: ...

    async def healthy(self) -> bool: ...


class LocalStorage:
    """Stores originals under `<root>/<sha256>.<ext>`; identical uploads are deduplicated."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        if not _KEY.fullmatch(key):
            raise KeyError(key)
        return self.root / key

    async def put(self, data: bytes, extension: str) -> str:
        key = f"{hashlib.sha256(data).hexdigest()}.{extension.lower()}"
        path = self._path(key)

        def write() -> None:
            self.root.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                tmp = path.with_suffix(path.suffix + ".tmp")
                tmp.write_bytes(data)
                tmp.replace(path)

        await asyncio.to_thread(write)
        return key

    async def get(self, key: str) -> bytes | None:
        try:
            path = self._path(key)
        except KeyError:
            return None
        if not path.is_file():
            return None
        return await asyncio.to_thread(path.read_bytes)

    async def healthy(self) -> bool:
        def check() -> bool:
            self.root.mkdir(parents=True, exist_ok=True)
            probe = self.root / ".healthcheck"
            probe.write_bytes(b"ok")
            probe.unlink()
            return True

        try:
            return await asyncio.to_thread(check)
        except OSError:
            return False
