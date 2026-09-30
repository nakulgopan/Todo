import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import DuplicateKeyError, get_db
from app.errors import AppError
from app.services.tasks import default_settings
from app.utils import utcnow

bearer_scheme = HTTPBearer(auto_error=False)


def _auth_headers(token: str | None = None) -> dict[str, str]:
    headers = {"apikey": settings.supabase_anon_key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_auth_user(token: str) -> dict:
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise AppError(500, "Supabase is not configured")
    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers=_auth_headers(token),
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise AppError(401, "Not authenticated") from exc
    if response.status_code != 200:
        raise AppError(401, "Not authenticated")
    body = response.json()
    if not body.get("id"):
        raise AppError(401, "Not authenticated")
    return body


def update_auth_user(token: str, payload: dict) -> dict:
    response = httpx.put(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
        headers=_auth_headers(token),
        json=payload,
        timeout=20,
    )
    if response.status_code >= 400:
        detail = "Could not update the account"
        try:
            message = response.json().get("msg") or response.json().get("error_description") or response.json().get("message")
            if isinstance(message, str) and message:
                detail = message
        except Exception:
            pass
        raise AppError(400, detail)
    return response.json()


def sign_in_with_password(email: str, password: str) -> dict:
    try:
        response = httpx.post(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
            headers=_auth_headers(),
            json={"email": email, "password": password},
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise AppError(401, "Invalid email or password") from exc
    if response.status_code != 200:
        raise AppError(401, "Invalid email or password")
    body = response.json()
    if not body.get("access_token"):
        raise AppError(401, "Invalid email or password")
    return body


def verify_password(email: str, password: str) -> bool:
    response = httpx.post(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
        headers=_auth_headers(),
        json={"email": email, "password": password},
        timeout=20,
    )
    return response.status_code == 200


def get_access_token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(401, "Not authenticated")
    return credentials.credentials


def get_database(token: str = Depends(get_access_token)):
    return get_db(token)


def get_current_user(token: str = Depends(get_access_token), db=Depends(get_database)) -> dict:
    auth_user = fetch_auth_user(token)
    user_id = auth_user["id"]
    metadata = auth_user.get("user_metadata") or {}
    email = auth_user.get("email") or ""
    display_name = metadata.get("display_name") or (email.split("@")[0] if email else "User")
    profile = db.profiles.find_one({"_id": user_id})
    now = utcnow()
    if not profile:
        try:
            db.profiles.insert_one(
                {
                    "_id": user_id,
                    "display_name": display_name,
                    "avatar_url": metadata.get("avatar_url"),
                    "created_at": now,
                    "updated_at": now,
                }
            )
        except DuplicateKeyError:
            pass
        profile = db.profiles.find_one({"_id": user_id}) or {
            "display_name": display_name,
            "avatar_url": None,
            "created_at": now,
            "updated_at": now,
        }
    if not db.user_settings.find_one({"user_id": user_id}):
        settings_row = default_settings()
        settings_row.update({"user_id": user_id, "created_at": now, "updated_at": now})
        try:
            db.user_settings.insert_one(settings_row)
        except DuplicateKeyError:
            pass
    return {
        "_id": user_id,
        "name": profile.get("display_name") or display_name,
        "email": email,
        "avatar_url": profile.get("avatar_url"),
        "created_at": profile.get("created_at"),
        "updated_at": profile.get("updated_at"),
        "_access_token": token,
    }
