"""API tests against the real app wired to a temporary SQLite database."""

from __future__ import annotations

import pytest
from fastapi import status
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


def _register_and_login(client: TestClient, user: dict[str, str]) -> dict[str, str]:
    assert client.post("/api/v1/auth/register", json=user).status_code == 201
    response = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert response.status_code == status.HTTP_200_OK
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


class TestAuthEndpoints:
    def test_register_user_success(self, client: TestClient, sample_user_data):
        response = client.post("/api/v1/auth/register", json=sample_user_data)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == sample_user_data["email"]
        assert data["full_name"] == "John Doe"
        assert data["is_active"] is True
        assert data["is_verified"] is False

    def test_register_duplicate_email_rejected(self, client: TestClient, sample_user_data):
        client.post("/api/v1/auth/register", json=sample_user_data)
        response = client.post("/api/v1/auth/register", json=sample_user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.parametrize(
        ("field", "value"),
        [("email", "invalid-email"), ("password", "weak"), ("password", "nouppercase1!")],
    )
    def test_register_validation_errors(self, client: TestClient, sample_user_data, field, value):
        response = client.post("/api/v1/auth/register", json={**sample_user_data, field: value})

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_login_success(self, client: TestClient, sample_user_data):
        client.post("/api/v1/auth/register", json=sample_user_data)
        response = client.post(
            "/api/v1/auth/login",
            json={"email": sample_user_data["email"], "password": sample_user_data["password"]},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0
        assert data["user"]["email"] == sample_user_data["email"]

    def test_login_invalid_credentials(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent@example.com", "password": "wrongpassword"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_me_requires_token(self, client: TestClient):
        response = client.get("/api/v1/auth/me")

        assert response.status_code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}

    def test_me_rejects_garbage_token(self, client: TestClient):
        response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_me_with_valid_token(self, client: TestClient, sample_user_data):
        headers = _register_and_login(client, sample_user_data)

        response = client.get("/api/v1/auth/me", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["email"] == sample_user_data["email"]


class TestUserEndpoints:
    def test_get_my_profile(self, client: TestClient, sample_user_data):
        headers = _register_and_login(client, sample_user_data)

        response = client.get("/api/v1/users/me", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["first_name"] == "John"

    def test_update_my_profile(self, client: TestClient, sample_user_data):
        headers = _register_and_login(client, sample_user_data)

        response = client.put(
            "/api/v1/users/me", json={"first_name": "Jane", "last_name": "Smith"}, headers=headers
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert (data["first_name"], data["last_name"]) == ("Jane", "Smith")
        assert data["email"] == sample_user_data["email"]

    def test_deactivate_my_account(self, client: TestClient, sample_user_data):
        headers = _register_and_login(client, sample_user_data)

        response = client.delete("/api/v1/users/me", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["message"] == "Account deactivated successfully"
        # A deactivated account can no longer use its token.
        assert client.get("/api/v1/users/me", headers=headers).status_code == 400


class TestHealthEndpoints:
    def test_health_check(self, client: TestClient):
        response = client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["checks"]["database"] == "ok"
        assert response.headers["X-Request-ID"]

    def test_root_endpoint(self, client: TestClient):
        response = client.get("/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["docs"] == "/docs"
