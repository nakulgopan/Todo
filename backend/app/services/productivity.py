from datetime import date, timedelta
import calendar

from app.database import run_transaction
from app.errors import AppError
from app.services.achievements import award_new, codes_for_flags
from app.services.motivation import motivational_message
from app.services.scheduling import (
    Schedule,
    build_flags,
    effective_points,
    score_from_tasks,
    summary_for,
    task_applies,
)
from app.services.streaks import compute_streaks
from app.services.tasks import get_owned_task
from app.utils import format_long_date, greeting_for_hour, utcnow


def load_schedule(db, user_id: str, session=None) -> Schedule:
    tasks = list(db.tasks.find({"user_id": user_id}, session=session))
    overrides = list(db.task_overrides.find({"user_id": user_id}, session=session))
    completions = list(db.task_completions.find({"user_id": user_id}, session=session))
    scores = list(db.daily_scores.find({"user_id": user_id}, session=session))
    return Schedule(tasks, overrides, completions, scores)


def upsert_score(db, user_id: str, day: date, summary: dict, session=None) -> None:
    now = utcnow()
    db.daily_scores.update_one(
        {"user_id": user_id, "date": day.isoformat()},
        {
            "$set": {**summary, "user_id": user_id, "date": day.isoformat(), "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
        session=session,
    )


def _previous_percentage(schedule: Schedule, day: date, today: date) -> int | None:
    previous = summary_for(schedule, day - timedelta(days=1), today, prefer_snapshot=True)
    if previous["total_tasks"] == 0:
        return None
    return previous["completion_percentage"]


def build_daily_payload(schedule: Schedule, user_id: str, day: date, today: date) -> dict:
    tasks = schedule.resolve(day)
    summary = score_from_tasks(tasks)
    flags = build_flags(schedule, today, live_dates={day} if day <= today else set())
    streaks = compute_streaks(flags, today)
    previous = _previous_percentage(schedule, day, today)
    message = motivational_message(
        user_id=str(user_id),
        day=day,
        completion_percentage=summary["completion_percentage"],
        total_points=summary["total_points"],
        completed_tasks=summary["completed_tasks"],
        total_tasks=summary["total_tasks"],
        is_perfect_day=summary["is_perfect_day"],
        current_streak=streaks["current"],
        previous_completion_percentage=previous,
    )
    return {
        "date": day.isoformat(),
        "tasks": [task for task in tasks if task["task_type"] == "RECURRING"],
        "custom_tasks": [task for task in tasks if task["task_type"] == "ONE_TIME"],
        **summary,
        "streak": streaks,
        "motivation": message,
        "previous_completion_percentage": previous,
    }


def get_daily(db, user_id: str, day: date, today: date, *, persist: bool) -> dict:
    schedule = load_schedule(db, user_id)
    payload = build_daily_payload(schedule, user_id, day, today)
    if persist and day == today:
        summary = {key: payload[key] for key in (
            "task_points",
            "bonus_points",
            "total_points",
            "completed_tasks",
            "total_tasks",
            "completion_percentage",
            "is_perfect_day",
        )}
        upsert_score(db, user_id, day, summary)
    return payload


def _mutate(db, user_id: str, task_id: str, day: date, today: date, completed: bool) -> dict:
    def work(session):
        task = get_owned_task_in_session(db, user_id, task_id, session)
        schedule = load_schedule(db, user_id, session=session)
        override = schedule.override_for(task["_id"], day)
        if not task_applies(task, day, override):
            raise AppError(400, "This task is not scheduled on that date")
        existing = schedule.completion_for(task["_id"], day)
        now = utcnow()
        if completed and existing and existing.get("completed"):
            earned = int(existing.get("earned_points") or 0)
        elif completed:
            earned = effective_points(task, override)
            db.task_completions.update_one(
                {"task_id": task["_id"], "completion_date": day.isoformat()},
                {
                    "$set": {
                        "user_id": user_id,
                        "completed": True,
                        "completed_at": now,
                        "earned_points": earned,
                    },
                    "$setOnInsert": {"task_id": task["_id"], "completion_date": day.isoformat()},
                },
                upsert=True,
                session=session,
            )
            schedule.set_completion(task["_id"], day, True, earned, now)
        else:
            db.task_completions.update_one(
                {"task_id": task["_id"], "completion_date": day.isoformat()},
                {
                    "$set": {
                        "user_id": user_id,
                        "completed": False,
                        "completed_at": None,
                        "earned_points": 0,
                    },
                    "$setOnInsert": {"task_id": task["_id"], "completion_date": day.isoformat()},
                },
                upsert=True,
                session=session,
            )
            schedule.set_completion(task["_id"], day, False, 0, None)

        summary = score_from_tasks(schedule.resolve(day))
        upsert_score(db, user_id, day, summary, session=session)
        schedule.scores[day.isoformat()] = {**summary, "date": day.isoformat()}
        flags = build_flags(schedule, today, live_dates={day})
        completed_count = db.task_completions.count_documents(
            {"user_id": user_id, "completed": True},
            session=session,
        )
        total_xp = _total_xp(db, user_id, session)
        unlocked = award_new(db, user_id, codes_for_flags(flags, today, completed_count, total_xp), session=session)
        payload = build_daily_payload(schedule, user_id, day, today)
        return {"daily": payload, "unlocked_achievements": unlocked}

    return run_transaction(db, work)


def get_owned_task_in_session(db, user_id: str, task_id: str, session) -> dict:
    from app.utils import parse_object_id

    found = db.tasks.find_one(
        {"_id": parse_object_id(task_id, "task id"), "user_id": user_id, "deleted": {"$ne": True}},
        session=session,
    )
    if not found:
        raise AppError(404, "Task not found")
    return found


def _total_xp(db, user_id: str, session) -> int:
    rows = list(
        db.daily_scores.aggregate(
            [{"$match": {"user_id": user_id}}, {"$group": {"_id": None, "total": {"$sum": "$total_points"}}}],
            session=session,
        )
    )
    return int(rows[0]["total"]) if rows else 0


def complete_task(db, user_id: str, task_id: str, day: date, today: date) -> dict:
    return _mutate(db, user_id, task_id, day, today, True)


def uncomplete_task(db, user_id: str, task_id: str, day: date, today: date) -> dict:
    return _mutate(db, user_id, task_id, day, today, False)


def dashboard(db, user: dict, day: date, hour: int) -> dict:
    settings = db.user_settings.find_one({"user_id": user["_id"]}) or {}
    daily = get_daily(db, user["_id"], day, day, persist=True)
    return {
        "greeting": greeting_for_hour(user["name"], hour),
        "name": user["name"],
        "date": day.isoformat(),
        "date_label": format_long_date(day),
        "daily_goal": int(settings.get("daily_goal") or 100),
        "daily": daily,
    }


def _iter_days(start: date, end: date):
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def stats(db, user_id: str, today: date) -> dict:
    schedule = load_schedule(db, user_id)
    today_tasks = schedule.resolve(today)
    today_summary = score_from_tasks(today_tasks)
    upsert_score(db, user_id, today, today_summary)
    schedule.scores[today.isoformat()] = {**today_summary, "date": today.isoformat()}
    flags = build_flags(schedule, today, live_dates={today})
    streaks = compute_streaks(flags, today)

    def day_summary(day: date) -> dict:
        return summary_for(schedule, day, today, prefer_snapshot=True)

    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    weekly_xp = sum(day_summary(day)["total_points"] for day in _iter_days(week_start, today))
    monthly_xp = sum(day_summary(day)["total_points"] for day in _iter_days(month_start, today))

    xp_by_day = []
    tasks_by_day = []
    for offset in range(13, -1, -1):
        day = today - timedelta(days=offset)
        summary = day_summary(day)
        xp_by_day.append({"date": day.isoformat(), "xp": summary["total_points"]})
        tasks_by_day.append({"date": day.isoformat(), "completed": summary["completed_tasks"]})

    last_30 = [day_summary(today - timedelta(days=offset)) for offset in range(29, -1, -1)]
    active_days = [item for item in last_30 if item["total_tasks"] > 0]
    average = round(sum(item["total_points"] for item in active_days) / len(active_days), 1) if active_days else 0

    best = None
    for day_text, score in schedule.scores.items():
        xp = int(score.get("total_points") or 0)
        if best is None or xp > best["xp"]:
            best = {"date": day_text, "xp": xp, "date_label": format_long_date(date.fromisoformat(day_text))}

    total_xp = sum(int(score.get("total_points") or 0) for score in schedule.scores.values())
    total_completed = db.task_completions.count_documents({"user_id": user_id, "completed": True})

    weekly_completion = []
    for weeks_ago in range(7, -1, -1):
        anchor = today - timedelta(days=7 * weeks_ago)
        start = anchor - timedelta(days=anchor.weekday())
        end = min(start + timedelta(days=6), today)
        summaries = [day_summary(day) for day in _iter_days(start, end) if day <= today]
        relevant = [item for item in summaries if item["total_tasks"] > 0]
        percentage = round(sum(item["completion_percentage"] for item in relevant) / len(relevant)) if relevant else 0
        weekly_completion.append({"label": start.isoformat(), "percentage": percentage})

    monthly_completion = []
    year = today.year
    month = today.month
    months = []
    for _ in range(6):
        months.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    for year, month in reversed(months):
        start = date(year, month, 1)
        last = calendar.monthrange(year, month)[1]
        end = min(date(year, month, last), today)
        if start > today:
            continue
        summaries = [day_summary(day) for day in _iter_days(start, end)]
        relevant = [item for item in summaries if item["total_tasks"] > 0]
        percentage = round(sum(item["completion_percentage"] for item in relevant) / len(relevant)) if relevant else 0
        monthly_completion.append({"label": start.strftime("%b %Y"), "percentage": percentage})

    return {
        "daily_xp": today_summary["total_points"],
        "weekly_xp": weekly_xp,
        "monthly_xp": monthly_xp,
        "completion_percentage": today_summary["completion_percentage"],
        "average_daily_xp": average,
        "current_streak": streaks["current"],
        "longest_streak": streaks["longest"],
        "weekly_streak": streaks["weekly"],
        "monthly_streak": streaks["monthly"],
        "total_completed_tasks": total_completed,
        "total_xp": total_xp,
        "best_day": best,
        "xp_by_day": xp_by_day,
        "tasks_completed_by_day": tasks_by_day,
        "weekly_completion": weekly_completion,
        "monthly_completion": monthly_completion,
    }


def history(db, user_id: str, today: date, days: int) -> dict:
    days = min(max(days, 1), 366)
    schedule = load_schedule(db, user_id)
    flags = build_flags(schedule, today)
    items = []
    for offset in range(days):
        day = today - timedelta(days=offset)
        summary = summary_for(schedule, day, today, prefer_snapshot=True)
        if summary["total_tasks"] == 0:
            continue
        items.append(
            {
                "date": day.isoformat(),
                "date_label": format_long_date(day),
                "completed_tasks": summary["completed_tasks"],
                "total_tasks": summary["total_tasks"],
                "completion_percentage": summary["completion_percentage"],
                "xp": summary["total_points"],
                "streak": compute_streaks({key: value for key, value in flags.items() if key <= day}, day)["current"],
                "is_perfect_day": summary["is_perfect_day"],
            }
        )
    return {"items": items}


def calendar_month(db, user_id: str, year: int, month: int, today: date) -> dict:
    if year < 2000 or year > 2100 or month < 1 or month > 12:
        raise AppError(400, "Invalid calendar month")
    schedule = load_schedule(db, user_id)
    last = calendar.monthrange(year, month)[1]
    days = []
    for day_number in range(1, last + 1):
        day = date(year, month, day_number)
        summary = summary_for(schedule, day, today, prefer_snapshot=day <= today)
        days.append(
            {
                "date": day.isoformat(),
                "total_tasks": summary["total_tasks"],
                "completed_tasks": summary["completed_tasks"],
                "completion_percentage": summary["completion_percentage"],
                "xp": summary["total_points"],
                "is_perfect_day": summary["is_perfect_day"],
            }
        )
    return {"year": year, "month": month, "days": days}
