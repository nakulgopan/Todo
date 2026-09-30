from datetime import date, timedelta

from app.services.achievements import eligible_codes
from app.services.motivation import motivational_message
from app.services.scheduling import task_applies
from app.services.streaks import compute_streaks, has_perfect_week, is_comeback


def _flags(*states: bool | None) -> dict[date, bool | None]:
    start = date(2026, 9, 1)
    return {start + timedelta(days=index): state for index, state in enumerate(states)}


def test_empty_days_do_not_break_or_count_as_failure():
    flags = _flags(True, None, True, None, True)
    streaks = compute_streaks(flags, date(2026, 9, 5))
    assert streaks["current"] == 3
    assert streaks["longest"] == 3


def test_failed_day_breaks_current_streak_but_open_today_does_not():
    flags = _flags(True, True, False)
    closed = compute_streaks(flags, date(2026, 9, 3))
    assert closed["current"] == 2
    earlier = compute_streaks(flags, date(2026, 9, 2))
    assert earlier["current"] == 2


def test_perfect_week_and_comeback():
    start = date(2026, 9, 7)  # Monday
    flags = {start + timedelta(days=offset): True for offset in range(7)}
    assert has_perfect_week(flags) is True
    flags[start + timedelta(days=7)] = False
    flags[start + timedelta(days=8)] = True
    assert is_comeback(flags, start + timedelta(days=8)) is True
    assert is_comeback(flags, start + timedelta(days=6)) is False


def test_weekday_and_custom_resolution():
    daily = {"task_type": "RECURRING", "repeat_rule": "DAILY", "start_date": "2026-09-30", "is_active": True}
    weekdays = {**daily, "repeat_rule": "WEEKDAYS"}
    custom = {**daily, "repeat_rule": "CUSTOM_WEEKDAYS", "custom_weekdays": [1, 3]}
    one_time = {"task_type": "ONE_TIME", "specific_date": "2026-10-02", "is_active": True}
    assert task_applies(daily, date(2026, 10, 1), None) is True
    assert task_applies(weekdays, date(2026, 9, 30), None) is True
    assert task_applies(weekdays, date(2026, 10, 3), None) is False
    assert task_applies(custom, date(2026, 9, 30), None) is True
    assert task_applies(custom, date(2026, 10, 1), None) is False
    assert task_applies(one_time, date(2026, 10, 2), None) is True
    assert task_applies(one_time, date(2026, 10, 3), None) is False
    assert task_applies(daily, date(2026, 10, 1), {"is_skipped": True}) is False


def test_motivation_changes_with_context_and_stays_stable():
    perfect = motivational_message(
        user_id="user",
        day=date(2026, 9, 30),
        completion_percentage=100,
        total_points=130,
        completed_tasks=8,
        total_tasks=8,
        is_perfect_day=True,
        current_streak=2,
        previous_completion_percentage=40,
    )
    small = motivational_message(
        user_id="user",
        day=date(2026, 9, 30),
        completion_percentage=10,
        total_points=10,
        completed_tasks=1,
        total_tasks=8,
        is_perfect_day=False,
        current_streak=0,
        previous_completion_percentage=0,
    )
    week = motivational_message(
        user_id="user",
        day=date(2026, 9, 30),
        completion_percentage=100,
        total_points=80,
        completed_tasks=4,
        total_tasks=4,
        is_perfect_day=True,
        current_streak=7,
        previous_completion_percentage=100,
    )
    again = motivational_message(
        user_id="user",
        day=date(2026, 9, 30),
        completion_percentage=100,
        total_points=130,
        completed_tasks=8,
        total_tasks=8,
        is_perfect_day=True,
        current_streak=2,
        previous_completion_percentage=40,
    )
    assert "PERFECT DAY" in perfect
    assert perfect != small
    assert "week" in week.lower()
    assert perfect == again


def test_achievement_codes_cover_catalog_rules():
    assert "FIRST_TASK" in eligible_codes(
        completed_count=1,
        total_xp=15,
        current_streak=1,
        longest_streak=1,
        has_perfect_day=False,
        perfect_week=False,
        comeback=False,
    )
    codes = eligible_codes(
        completed_count=100,
        total_xp=1000,
        current_streak=30,
        longest_streak=30,
        has_perfect_day=True,
        perfect_week=True,
        comeback=True,
    )
    assert {
        "FIRST_TASK",
        "FIRST_PERFECT_DAY",
        "THREE_DAY_STREAK",
        "SEVEN_DAY_STREAK",
        "THIRTY_DAY_STREAK",
        "ONE_HUNDRED_TASKS",
        "FIVE_HUNDRED_XP",
        "ONE_THOUSAND_XP",
        "PERFECT_WEEK",
        "COMEBACK",
    } <= set(codes)
