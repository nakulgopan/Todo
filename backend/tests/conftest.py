import os

os.environ["APP_ENV"] = "test"
os.environ["JWT_SECRET"] = "test-secret-key"
os.environ["AUTH_RATE_LIMIT"] = "1000"
os.environ["CORS_ORIGINS"] = "http://localhost:4200"

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import close_client, get_client, get_db
from app.main import app
from app.rate_limit import reset_rate_limits

COLLECTIONS = [
    "task_overrides",
    "task_completions",
    "daily_scores",
    "user_achievements",
    "user_settings",
    "tasks",
    "profiles",
]


def _headers() -> dict[str, str]:
    return {"apikey": settings.supabase_anon_key, "Content-Type": "application/json"}


def supabase_signup(email: str, password: str, name: str) -> httpx.Response:
    return httpx.post(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/signup",
        headers=_headers(),
        json={"email": email, "password": password, "data": {"display_name": name}},
        timeout=30,
    )


def supabase_login(email: str, password: str) -> httpx.Response:
    return httpx.post(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
        headers=_headers(),
        json={"email": email, "password": password},
        timeout=30,
    )


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    _wipe()
    close_client()


@pytest.fixture(autouse=True)
def clean_database(request):
    if "client" in request.fixturenames:
        _wipe()
    yield
    if "client" not in request.fixturenames:
        return
    _wipe()
    reset_rate_limits()


def _wipe() -> None:
    admin = get_client()
    listed = admin.auth.admin.list_users()
    users = getattr(listed, "users", listed)
    for user in users or []:
        email = getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else None)
        user_id = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
        if email and email.endswith("@example.com") and user_id:
            admin.auth.admin.delete_user(user_id)
    database = get_db()
    for name in COLLECTIONS:
        database[name].delete_many({})


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register(client: TestClient, email: str = "nakul@example.com", name: str = "Nakul", password: str = "Password1"):
    admin = get_client()
    admin.auth.admin.create_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"display_name": name},
        }
    )
    login = supabase_login(email, password)
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = client.get("/api/auth/me", headers=auth_header(token))
    assert me.status_code == 200, me.text
    return {"access_token": token, "token_type": "bearer", "user": me.json()}


def create_task(client: TestClient, token: str, **overrides):
    payload = {
        "title": "Gym",
        "description": "Workout",
        "priority": "MEDIUM",
        "task_type": "RECURRING",
        "repeat_rule": "DAILY",
        "start_date": "2026-09-30",
    }
    payload.update(overrides)
    response = client.post("/api/tasks", json=payload, headers=auth_header(token))
    assert response.status_code == 201, response.text
    return response.json()
