from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from recommender.config import Settings
from recommender.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'test.db'}",
        jwt_secret_key=SecretStr("test-secret-key-with-at-least-32-bytes!"),
        seed_demo_data=True,
        log_json=False,
        log_level="WARNING",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


class GraphQL:
    def __init__(self, client: TestClient) -> None:
        self.client = client
        self.token: str | None = None

    def __call__(self, query: str, **variables: Any) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        response = self.client.post(
            "/graphql", json={"query": query, "variables": variables}, headers=headers
        )
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body

    def login_new_user(self, email: str = "ada@example.com") -> str:
        body = self(
            'mutation($e: String!) { register(email: $e, username: "ada", password: "s3cret-pass") { token } }',
            e=email,
        )
        self.token = body["data"]["register"]["token"]
        return self.token


@pytest.fixture
def gql(client: TestClient) -> GraphQL:
    return GraphQL(client)
