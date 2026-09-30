import httpx

from app.dependencies.auth import update_auth_user, verify_password
from app.errors import AppError
from app.schemas.models import PasswordChange, ProfileUpdate
from app.services.tasks import default_settings
from app.utils import public_user, utcnow


def get_profile(db, user: dict) -> dict:
    settings = db.user_settings.find_one({"user_id": user["_id"]}) or default_settings()
    return {"user": public_user(user), "settings": _public_settings(settings)}


def update_profile(db, user: dict, payload: ProfileUpdate) -> dict:
    now = utcnow()
    profile_updates = {}
    if payload.name is not None:
        profile_updates["display_name"] = payload.name
        user["name"] = payload.name
    if payload.avatar_url is not None:
        profile_updates["avatar_url"] = payload.avatar_url or None
        user["avatar_url"] = profile_updates["avatar_url"]
    if payload.email is not None and payload.email.lower() != user["email"].lower():
        update_auth_user(user["_access_token"], {"email": payload.email.lower()})
        user["email"] = payload.email.lower()
    if profile_updates:
        profile_updates["updated_at"] = now
        db.profiles.update_one({"_id": user["_id"]}, {"$set": profile_updates})
        user["updated_at"] = now
    settings_updates = {}
    if payload.daily_goal is not None:
        settings_updates["daily_goal"] = payload.daily_goal
    if payload.theme is not None:
        settings_updates["theme"] = payload.theme
    if payload.notifications is not None:
        settings_updates["notifications"] = payload.notifications.model_dump()
    if payload.default_points is not None:
        settings_updates["default_points"] = payload.default_points.model_dump()
    if settings_updates:
        settings_updates["updated_at"] = now
        db.user_settings.update_one({"user_id": user["_id"]}, {"$set": settings_updates}, upsert=True)
    return get_profile(db, user)


def change_password(user: dict, payload: PasswordChange) -> None:
    if payload.current_password == payload.new_password:
        raise AppError(400, "Choose a different password")
    try:
        current_ok = verify_password(user["email"], payload.current_password)
    except httpx.HTTPError as exc:
        raise AppError(400, "Could not verify the current password") from exc
    if not current_ok:
        raise AppError(400, "Current password is incorrect")
    update_auth_user(user["_access_token"], {"password": payload.new_password})


def _public_settings(settings: dict) -> dict:
    defaults = default_settings()
    return {
        "daily_goal": int(settings.get("daily_goal", defaults["daily_goal"])),
        "default_points": settings.get("default_points") or defaults["default_points"],
        "theme": settings.get("theme") or "system",
        "notifications": settings.get("notifications") or defaults["notifications"],
    }


def list_achievements(db, user_id: str) -> list[dict]:
    unlocked = {item["achievement_code"]: item for item in db.user_achievements.find({"user_id": user_id})}
    items = []
    for achievement in db.achievements.find({}).sort("code", 1):
        owned = unlocked.get(achievement["code"])
        items.append(
            {
                "code": achievement["code"],
                "name": achievement["name"],
                "description": achievement["description"],
                "icon": achievement["icon"],
                "requirement": achievement.get("requirement") or "",
                "unlocked": owned is not None,
                "unlocked_at": owned.get("unlocked_at") if owned else None,
            }
        )
    return items
