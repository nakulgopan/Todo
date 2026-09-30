from datetime import date, timedelta

from app.constants import DEFAULT_POINTS, PERFECT_DAY_BONUS, PRIORITY_RANK, STREAK_LOOKBACK_DAYS
from app.utils import parse_date


def task_applies(task: dict, day: date, override: dict | None) -> bool:
    if task.get("deleted"):
        return False
    if override and override.get("is_skipped"):
        return False
    if not task.get("is_active", True):
        return False

    if task.get("task_type") == "ONE_TIME":
        return task.get("specific_date") == day.isoformat()

    if task.get("task_type") != "RECURRING":
        return False

    start = parse_date(task.get("start_date"))
    end = parse_date(task.get("end_date"))
    if start and day < start:
        return False
    if end and day > end:
        return False

    rule = task.get("repeat_rule")
    if rule == "DAILY":
        return True
    if rule == "WEEKDAYS":
        return day.weekday() + 1 <= 5
    if rule == "CUSTOM_WEEKDAYS":
        return day.weekday() + 1 in set(task.get("custom_weekdays") or [])
    return False


def effective_points(task: dict, override: dict | None) -> int:
    if override and override.get("points") is not None:
        return int(override["points"])
    return int(task.get("points") or DEFAULT_POINTS["MEDIUM"])


def _override_value(task: dict, override: dict | None, field: str):
    if override and override.get(field) is not None:
        return override[field]
    return task.get(field)


class Schedule:
    def __init__(self, tasks: list[dict], overrides: list[dict], completions: list[dict], scores: list[dict]):
        self.tasks = tasks
        self.overrides = {(str(item["task_id"]), item["override_date"]): item for item in overrides}
        self.completions = {(str(item["task_id"]), item["completion_date"]): item for item in completions}
        self.scores = {item["date"]: item for item in scores}

    def override_for(self, task_id: str, day: date) -> dict | None:
        return self.overrides.get((str(task_id), day.isoformat()))

    def completion_for(self, task_id: str, day: date) -> dict | None:
        return self.completions.get((str(task_id), day.isoformat()))

    def set_completion(self, task_id: str, day: date, completed: bool, earned_points: int, completed_at) -> None:
        self.completions[(str(task_id), day.isoformat())] = {
            "task_id": task_id,
            "completion_date": day.isoformat(),
            "completed": completed,
            "earned_points": earned_points,
            "completed_at": completed_at,
        }

    def resolve(self, day: date) -> list[dict]:
        items: list[dict] = []
        for task in self.tasks:
            override = self.override_for(task["_id"], day)
            completion = self.completion_for(task["_id"], day)
            completed = bool(completion and completion.get("completed"))
            applies = task_applies(task, day, override)
            historical = (not applies) and completed and bool(task.get("deleted") or not task.get("is_active", True))
            if not applies and not historical:
                continue
            scheduled_points = effective_points(task, override)
            earned = int(completion.get("earned_points") or 0) if completed else 0
            items.append(
                {
                    "id": str(task["_id"]),
                    "title": _override_value(task, override, "title"),
                    "description": _override_value(task, override, "description") or "",
                    "priority": _override_value(task, override, "priority"),
                    "points": scheduled_points,
                    "earned_points": earned,
                    "task_type": task.get("task_type"),
                    "repeat_rule": task.get("repeat_rule"),
                    "custom_weekdays": list(task.get("custom_weekdays") or []),
                    "completed": completed,
                    "is_custom": task.get("task_type") == "ONE_TIME",
                }
            )
        items.sort(key=lambda item: (PRIORITY_RANK.get(item["priority"], 9), item["title"].lower()))
        return items


def score_from_tasks(tasks: list[dict]) -> dict:
    total = len(tasks)
    completed = sum(1 for task in tasks if task["completed"])
    task_points = sum(int(task["earned_points"]) for task in tasks if task["completed"])
    percentage = int(round(100 * completed / total)) if total else 0
    perfect = total > 0 and completed == total
    bonus = PERFECT_DAY_BONUS if perfect else 0
    return {
        "task_points": task_points,
        "bonus_points": bonus,
        "total_points": task_points + bonus,
        "completed_tasks": completed,
        "total_tasks": total,
        "completion_percentage": percentage,
        "is_perfect_day": perfect,
    }


def snapshot_summary(score: dict) -> dict:
    return {
        "task_points": int(score.get("task_points") or 0),
        "bonus_points": int(score.get("bonus_points") or 0),
        "total_points": int(score.get("total_points") or 0),
        "completed_tasks": int(score.get("completed_tasks") or 0),
        "total_tasks": int(score.get("total_tasks") or 0),
        "completion_percentage": int(score.get("completion_percentage") or 0),
        "is_perfect_day": bool(score.get("is_perfect_day")),
    }


def summary_for(schedule: Schedule, day: date, today: date, *, prefer_snapshot: bool) -> dict:
    if prefer_snapshot and day < today:
        snapshot = schedule.scores.get(day.isoformat())
        if snapshot:
            return snapshot_summary(snapshot)
    return score_from_tasks(schedule.resolve(day))


def window_start(schedule: Schedule, today: date) -> date:
    dates = [today]
    floor = today - timedelta(days=STREAK_LOOKBACK_DAYS)
    for task in schedule.tasks:
        for key in ("start_date", "specific_date"):
            parsed = parse_date(task.get(key))
            if parsed:
                dates.append(parsed)
    for day_text in schedule.scores:
        parsed = parse_date(day_text)
        if parsed:
            dates.append(parsed)
    return max(min(dates), floor)


def build_flags(schedule: Schedule, today: date, *, live_dates: set[date] | None = None) -> dict[date, bool | None]:
    live_dates = live_dates or set()
    flags: dict[date, bool | None] = {}
    cursor = window_start(schedule, today)
    while cursor <= today:
        if cursor == today or cursor in live_dates:
            tasks = schedule.resolve(cursor)
            flags[cursor] = None if not tasks else all(task["completed"] for task in tasks)
        else:
            snapshot = schedule.scores.get(cursor.isoformat())
            if snapshot:
                flags[cursor] = None if int(snapshot.get("total_tasks") or 0) == 0 else bool(snapshot.get("is_perfect_day"))
            else:
                tasks = schedule.resolve(cursor)
                flags[cursor] = None if not tasks else all(task["completed"] for task in tasks)
        cursor += timedelta(days=1)
    return flags
