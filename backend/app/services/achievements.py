from datetime import date

from app.constants import ACHIEVEMENT_CATALOG
from app.database import DuplicateKeyError
from app.services.streaks import compute_streaks, has_perfect_week, is_comeback
from app.utils import utcnow


def eligible_codes(
    *,
    completed_count: int,
    total_xp: int,
    current_streak: int,
    longest_streak: int,
    has_perfect_day: bool,
    perfect_week: bool,
    comeback: bool,
) -> list[str]:
    best_streak = max(current_streak, longest_streak)
    codes: list[str] = []
    if completed_count >= 1:
        codes.append("FIRST_TASK")
    if has_perfect_day:
        codes.append("FIRST_PERFECT_DAY")
    if best_streak >= 3:
        codes.append("THREE_DAY_STREAK")
    if best_streak >= 7:
        codes.append("SEVEN_DAY_STREAK")
    if best_streak >= 30:
        codes.append("THIRTY_DAY_STREAK")
    if completed_count >= 100:
        codes.append("ONE_HUNDRED_TASKS")
    if total_xp >= 500:
        codes.append("FIVE_HUNDRED_XP")
    if total_xp >= 1000:
        codes.append("ONE_THOUSAND_XP")
    if perfect_week:
        codes.append("PERFECT_WEEK")
    if comeback:
        codes.append("COMEBACK")
    return codes


def codes_for_flags(flags: dict[date, bool | None], today: date, completed_count: int, total_xp: int) -> list[str]:
    streaks = compute_streaks(flags, today)
    return eligible_codes(
        completed_count=completed_count,
        total_xp=total_xp,
        current_streak=streaks["current"],
        longest_streak=streaks["longest"],
        has_perfect_day=any(flag is True for flag in flags.values()),
        perfect_week=has_perfect_week(flags),
        comeback=is_comeback(flags, today),
    )


def award_new(db, user_id, codes: list[str], session=None) -> list[dict]:
    catalog = {item["code"]: item for item in db.achievements.find({}, session=session)}
    if len(catalog) < len(ACHIEVEMENT_CATALOG):
        for item in ACHIEVEMENT_CATALOG:
            catalog.setdefault(item["code"], item)
    already = {
        item["achievement_code"]
        for item in db.user_achievements.find({"user_id": user_id}, {"achievement_code": 1}, session=session)
    }
    unlocked: list[dict] = []
    now = utcnow()
    for code in codes:
        if code in already:
            continue
        achievement = catalog.get(code)
        if not achievement:
            continue
        try:
            db.user_achievements.insert_one(
                {
                    "user_id": user_id,
                    "achievement_id": achievement.get("_id"),
                    "achievement_code": code,
                    "unlocked_at": now,
                },
                session=session,
            )
        except DuplicateKeyError:
            continue
        already.add(code)
        unlocked.append(
            {
                "code": code,
                "name": achievement.get("name", code),
                "description": achievement.get("description", ""),
                "icon": achievement.get("icon", "emoji_events"),
                "unlocked_at": now,
            }
        )
    return unlocked
