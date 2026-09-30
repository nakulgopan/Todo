from datetime import date, timedelta

from app.constants import PRIORITY_RANK
from app.database import DuplicateKeyError
from app.errors import AppError
from app.schemas.models import TaskCreate, TaskUpdate, validate_task_fields
from app.utils import parse_object_id, utcnow


def default_settings() -> dict:
    return {
        "daily_goal": 100,
        "default_points": {"LOW": 10, "MEDIUM": 15, "HIGH": 20, "URGENT": 30},
        "theme": "system",
        "notifications": {"reminders": True, "achievements": True, "email": False},
    }


def points_for(priority: str, explicit: int | None, settings: dict | None) -> int:
    if explicit is not None:
        return explicit
    custom = (settings or {}).get("default_points") or {}
    if priority in custom:
        return int(custom[priority])
    return {"LOW": 10, "MEDIUM": 15, "HIGH": 20, "URGENT": 30}[priority]


def task_document(user_id: str, payload: TaskCreate, settings: dict | None) -> dict:
    now = utcnow()
    return {
        "user_id": user_id,
        "title": payload.title,
        "description": payload.description,
        "priority": payload.priority.value,
        "points": points_for(payload.priority.value, payload.points, settings),
        "task_type": payload.task_type.value,
        "repeat_rule": payload.repeat_rule.value,
        "custom_weekdays": payload.custom_weekdays,
        "start_date": payload.start_date.isoformat() if payload.start_date else None,
        "end_date": payload.end_date.isoformat() if payload.end_date else None,
        "specific_date": payload.specific_date.isoformat() if payload.specific_date else None,
        "is_active": True,
        "deleted": False,
        "created_at": now,
        "updated_at": now,
    }


def serialize_task(task: dict) -> dict:
    return {
        "id": str(task["_id"]),
        "title": task["title"],
        "description": task.get("description") or "",
        "priority": task["priority"],
        "points": task["points"],
        "task_type": task["task_type"],
        "repeat_rule": task["repeat_rule"],
        "custom_weekdays": list(task.get("custom_weekdays") or []),
        "start_date": task.get("start_date"),
        "end_date": task.get("end_date"),
        "specific_date": task.get("specific_date"),
        "is_active": bool(task.get("is_active", True)),
        "created_at": task["created_at"],
        "updated_at": task["updated_at"],
    }


def get_owned_task(db, user_id: str, task_id: str) -> dict:
    found = db.tasks.find_one(
        {"_id": parse_object_id(task_id, "task id"), "user_id": user_id, "deleted": {"$ne": True}}
    )
    if not found:
        raise AppError(404, "Task not found")
    return found


def list_tasks(db, user_id: str, *, task_filter: str, search: str, sort: str, order: str) -> list[dict]:
    query: dict = {"user_id": user_id, "deleted": {"$ne": True}}
    if task_filter == "active":
        query["is_active"] = True
    elif task_filter == "recurring":
        query["task_type"] = "RECURRING"
    elif task_filter == "one_time":
        query["task_type"] = "ONE_TIME"
    elif task_filter == "high_priority":
        query["priority"] = {"$in": ["HIGH", "URGENT"]}
    elif task_filter != "all":
        raise AppError(400, "Unknown task filter")
    if search.strip():
        query["title"] = {"$regex": search.strip(), "$options": "i"}
    items = list(db.tasks.find(query))
    reverse = order == "desc"
    if sort == "created":
        items.sort(key=lambda task: task["created_at"], reverse=reverse)
    elif sort == "points":
        items.sort(key=lambda task: task["points"], reverse=reverse)
    elif sort == "title":
        items.sort(key=lambda task: task["title"].lower(), reverse=reverse)
    elif sort == "priority":
        items.sort(key=lambda task: (PRIORITY_RANK.get(task["priority"], 9), task["title"].lower()), reverse=reverse)
    else:
        raise AppError(400, "Unknown sort")
    return [serialize_task(task) for task in items]


def create_task(db, user_id: str, payload: TaskCreate) -> dict:
    settings = db.user_settings.find_one({"user_id": user_id}) or {}
    result = db.tasks.insert_one(task_document(user_id, payload, settings))
    created = db.tasks.find_one({"_id": result.inserted_id, "user_id": user_id})
    return serialize_task(created)


def _merged_payload(existing: dict, patch: TaskUpdate) -> TaskCreate:
    data = {
        "title": existing["title"],
        "description": existing.get("description") or "",
        "priority": existing["priority"],
        "points": existing["points"],
        "task_type": existing["task_type"],
        "repeat_rule": existing["repeat_rule"],
        "custom_weekdays": list(existing.get("custom_weekdays") or []),
        "start_date": existing.get("start_date"),
        "end_date": existing.get("end_date"),
        "specific_date": existing.get("specific_date"),
    }
    for field in (
        "title",
        "description",
        "priority",
        "points",
        "task_type",
        "repeat_rule",
        "custom_weekdays",
        "start_date",
        "end_date",
        "specific_date",
    ):
        value = getattr(patch, field)
        if value is not None:
            data[field] = value.value if hasattr(value, "value") else value
    if patch.clear_end_date:
        data["end_date"] = None
    try:
        payload = TaskCreate.model_validate(data)
    except Exception as exc:
        raise AppError(422, _validation_message(exc)) from exc
    return payload


def _validation_message(exc: Exception) -> str:
    errors = getattr(exc, "errors", None)
    if callable(errors):
        details = errors()
        if details:
            return str(details[0].get("msg", "Invalid task"))
    return "Invalid task"


def _apply_document(existing: dict, payload: TaskCreate) -> dict:
    return {
        "title": payload.title,
        "description": payload.description,
        "priority": payload.priority.value,
        "points": payload.points if payload.points is not None else existing["points"],
        "task_type": payload.task_type.value,
        "repeat_rule": payload.repeat_rule.value,
        "custom_weekdays": payload.custom_weekdays,
        "start_date": payload.start_date.isoformat() if payload.start_date else None,
        "end_date": payload.end_date.isoformat() if payload.end_date else None,
        "specific_date": payload.specific_date.isoformat() if payload.specific_date else None,
        "updated_at": utcnow(),
    }


def update_task(db, user_id: str, task_id: str, patch: TaskUpdate) -> dict:
    existing = get_owned_task(db, user_id, task_id)
    if patch.edit_scope != "entire" and existing["task_type"] != "RECURRING":
        raise AppError(400, "Only recurring tasks can be edited for one date or from a date onward")
    if patch.edit_scope in {"occurrence", "future"} and patch.occurrence_date is None:
        raise AppError(400, "Choose the date this edit applies to")

    if patch.edit_scope == "occurrence":
        return _update_occurrence(db, user_id, existing, patch)
    if patch.edit_scope == "future":
        return _update_future(db, user_id, existing, patch)
    return _update_entire(db, user_id, existing, patch)


def _update_entire(db, user_id: str, existing: dict, patch: TaskUpdate) -> dict:
    payload = _merged_payload(existing, patch)
    updates = _apply_document(existing, payload)
    if patch.is_active is not None:
        updates["is_active"] = patch.is_active
    db.tasks.update_one({"_id": existing["_id"], "user_id": user_id}, {"$set": updates})
    return serialize_task(db.tasks.find_one({"_id": existing["_id"]}))


def _update_occurrence(db, user_id: str, existing: dict, patch: TaskUpdate) -> dict:
    occurrence = patch.occurrence_date
    assert occurrence is not None
    override_fields = {}
    for field in ("title", "description", "priority", "points"):
        value = getattr(patch, field)
        if value is not None:
            override_fields[field] = value.value if hasattr(value, "value") else value
    if not override_fields and patch.is_active is None:
        raise AppError(400, "Nothing to change for this occurrence")
    now = utcnow()
    db.task_overrides.update_one(
        {"task_id": existing["_id"], "override_date": occurrence.isoformat(), "user_id": user_id},
        {
            "$set": {**override_fields, "updated_at": now, "user_id": user_id},
            "$setOnInsert": {"task_id": existing["_id"], "override_date": occurrence.isoformat(), "created_at": now, "is_skipped": False},
        },
        upsert=True,
    )
    return serialize_task(existing)


def _update_future(db, user_id: str, existing: dict, patch: TaskUpdate) -> dict:
    occurrence = patch.occurrence_date
    assert occurrence is not None
    start = existing.get("start_date")
    if start and occurrence.isoformat() <= start:
        return _update_entire(db, user_id, existing, patch)

    payload = _merged_payload(existing, patch)
    if payload.task_type.value != "RECURRING":
        raise AppError(400, "From this date onward keeps the task recurring")
    payload.start_date = occurrence
    validate_task_fields(payload)
    previous_day = occurrence - timedelta(days=1)
    now = utcnow()
    db.tasks.update_one(
        {"_id": existing["_id"], "user_id": user_id},
        {"$set": {"end_date": previous_day.isoformat(), "updated_at": now}},
    )
    created = task_document(user_id, payload, None)
    created["points"] = payload.points if payload.points is not None else existing["points"]
    if patch.is_active is not None:
        created["is_active"] = patch.is_active
    inserted = db.tasks.insert_one(created)
    _carry_future_completions(db, user_id, existing["_id"], inserted.inserted_id, occurrence)
    return serialize_task(db.tasks.find_one({"_id": inserted.inserted_id}))


def _carry_future_completions(db, user_id: str, old_id: str, new_id: str, start: date) -> None:
    completions = db.task_completions.find(
        {
            "user_id": user_id,
            "task_id": old_id,
            "completion_date": {"$gte": start.isoformat()},
            "completed": True,
        }
    )
    for completion in completions:
        try:
            db.task_completions.insert_one(
                {
                    "task_id": new_id,
                    "user_id": user_id,
                    "completion_date": completion["completion_date"],
                    "completed": True,
                    "completed_at": completion.get("completed_at") or utcnow(),
                    "earned_points": int(completion.get("earned_points") or 0),
                }
            )
        except DuplicateKeyError:
            continue


def delete_task(db, user_id: str, task_id: str, scope: str, occurrence: date | None) -> None:
    existing = get_owned_task(db, user_id, task_id)
    if scope != "entire" and existing["task_type"] != "RECURRING":
        raise AppError(400, "Only recurring tasks support partial delete")
    if scope in {"occurrence", "future"} and occurrence is None:
        raise AppError(400, "Choose the date this delete applies to")
    if scope == "occurrence":
        now = utcnow()
        db.task_overrides.update_one(
            {"task_id": existing["_id"], "override_date": occurrence.isoformat(), "user_id": user_id},
            {
                "$set": {"is_skipped": True, "updated_at": now, "user_id": user_id},
                "$setOnInsert": {
                    "task_id": existing["_id"],
                    "override_date": occurrence.isoformat(),
                    "created_at": now,
                },
            },
            upsert=True,
        )
        return
    if scope == "future":
        start = existing.get("start_date")
        if start and occurrence.isoformat() <= start:
            scope = "entire"
        else:
            db.tasks.update_one(
                {"_id": existing["_id"], "user_id": user_id},
                {"$set": {"end_date": (occurrence - timedelta(days=1)).isoformat(), "updated_at": utcnow()}},
            )
            return
    db.tasks.update_one(
        {"_id": existing["_id"], "user_id": user_id},
        {"$set": {"deleted": True, "is_active": False, "updated_at": utcnow()}},
    )
    db.task_overrides.delete_many({"task_id": existing["_id"], "user_id": user_id})
