from datetime import date, datetime, timezone
from uuid import UUID

from app.errors import AppError


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso_date(value: date) -> str:
    return value.isoformat()


def parse_date(value: date | datetime | str | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise AppError(400, "Date must be YYYY-MM-DD") from exc


def parse_object_id(value: str, label: str = "id") -> str:
    try:
        return str(UUID(str(value)))
    except ValueError as exc:
        raise AppError(400, f"Invalid {label}") from exc


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "avatar_url": user.get("avatar_url"),
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
    }


def format_long_date(value: date) -> str:
    return f"{value.strftime('%A')}, {value.day} {value.strftime('%B')}"


def greeting_for_hour(name: str, hour: int) -> str:
    if hour < 12:
        part = "Good morning"
    elif hour < 17:
        part = "Good afternoon"
    elif hour < 21:
        part = "Good evening"
    else:
        part = "Good night"
    return f"{part}, {name}"
