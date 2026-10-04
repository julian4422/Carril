import os
import subprocess
import uuid
import warnings
from pathlib import Path

import httpx
import pytest

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api/v1"
REPO_ROOT = Path(__file__).resolve().parents[3]


def _cleanup(emails: list[str]) -> None:
    """Borra SOLO los usuarios creados en esta corrida (y sus tableros primero, por CASCADE/SET NULL)."""
    if not emails:
        return
    in_list = ", ".join("'" + e.replace("'", "''") + "'" for e in emails)
    sql = (
        f"DELETE FROM boards WHERE owner_id IN (SELECT id FROM users WHERE email IN ({in_list})); "
        f"DELETE FROM users WHERE email IN ({in_list});"
    )
    try:
        subprocess.run(
            ["docker", "compose", "exec", "-T", "db", "psql", "-U", "carril", "-d", "carril", "-v", "ON_ERROR_STOP=1", "-c", sql],
            cwd=REPO_ROOT, check=True, capture_output=True, timeout=60,
        )
    except Exception as exc:  # no romper la suite por la limpieza
        warnings.warn(f"No se pudieron limpiar los usuarios e2e ({exc}); borra manualmente: {emails}")


@pytest.fixture(scope="session")
def created_emails():
    emails: list[str] = []
    yield emails
    _cleanup(emails)


@pytest.fixture(scope="session")
def http():
    with httpx.Client(base_url=API, timeout=15) as c:
        try:
            r = c.get("/health")
            r.raise_for_status()
        except Exception as exc:
            pytest.skip(
                f"La API no responde en {API} ({exc}). Levántala con `docker compose up -d --build api` "
                "o define E2E_BASE_URL."
            )
        yield c


def _register(http, created_emails) -> dict:
    email = f"e2e-{uuid.uuid4().hex[:10]}@carril-e2e.dev"
    created_emails.append(email)
    r = http.post("/auth/register", json={"email": email, "full_name": "E2E", "password": "e2e-password"})
    assert r.status_code == 201, r.text
    r = http.post("/auth/login", json={"email": email, "password": "e2e-password"})
    assert r.status_code == 200, r.text
    tok = r.json()
    return {"email": email, "user": tok["user"], "h": {"Authorization": f"Bearer {tok['access_token']}"}}


@pytest.fixture
def user1(http, created_emails):
    return _register(http, created_emails)


@pytest.fixture
def user2(http, created_emails):
    return _register(http, created_emails)
