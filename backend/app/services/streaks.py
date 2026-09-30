from datetime import date, timedelta


def _period_state(
    days: list[date],
    flags: dict[date, bool | None],
    today: date,
    *,
    ignore_open_today: bool,
) -> str:
    saw_success = False
    for day in days:
        if day > today:
            break
        flag = flags.get(day)
        if flag is True:
            saw_success = True
        elif flag is False and not (ignore_open_today and day == today):
            return "fail"
    return "success" if saw_success else "empty"


def _week_days(anchor: date) -> list[date]:
    monday = anchor - timedelta(days=anchor.weekday())
    return [monday + timedelta(days=offset) for offset in range(7)]


def _month_days(anchor: date) -> list[date]:
    start = anchor.replace(day=1)
    if start.month == 12:
        next_month = date(start.year + 1, 1, 1)
    else:
        next_month = date(start.year, start.month + 1, 1)
    days: list[date] = []
    cursor = start
    while cursor < next_month:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


def _previous_anchor(anchor: date, kind: str) -> date:
    if kind == "week":
        return anchor - timedelta(days=7)
    month = 12 if anchor.month == 1 else anchor.month - 1
    year = anchor.year - 1 if anchor.month == 1 else anchor.year
    return date(year, month, 1)


def _consecutive(flags: dict[date, bool | None], today: date, kind: str) -> int:
    if not flags:
        return 0
    earliest = min(flags)
    anchor = today
    count = 0
    for _ in range(520):
        days = _week_days(anchor) if kind == "week" else _month_days(anchor)
        if days[0] < earliest - timedelta(days=31):
            break
        state = _period_state(days, flags, today, ignore_open_today=True)
        if state == "success":
            count += 1
        elif state == "fail":
            break
        anchor = _previous_anchor(days[0], kind)
    return count


def compute_streaks(flags: dict[date, bool | None], today: date) -> dict[str, int]:
    if not flags:
        return {"current": 0, "longest": 0, "weekly": 0, "monthly": 0}

    start = min(flags)
    end = max(max(flags), today)
    longest = 0
    run = 0
    cursor = start
    while cursor <= end:
        flag = flags.get(cursor)
        if flag is True:
            run += 1
            longest = max(longest, run)
        elif flag is False:
            run = 0
        cursor += timedelta(days=1)

    current = 0
    cursor = today if flags.get(today) is True else today - timedelta(days=1)
    while cursor >= start - timedelta(days=1):
        flag = flags.get(cursor)
        if flag is True:
            current += 1
        elif flag is False:
            break
        cursor -= timedelta(days=1)

    return {
        "current": current,
        "longest": longest,
        "weekly": _consecutive(flags, today, "week"),
        "monthly": _consecutive(flags, today, "month"),
    }


def has_perfect_week(flags: dict[date, bool | None]) -> bool:
    if not flags:
        return False
    monday = min(flags) - timedelta(days=min(flags).weekday())
    last = max(flags)
    while monday <= last:
        days = [monday + timedelta(days=offset) for offset in range(7)]
        if all(flags.get(day) is True for day in days):
            return True
        monday += timedelta(days=7)
    return False


def is_comeback(flags: dict[date, bool | None], today: date) -> bool:
    if flags.get(today) is not True or not flags:
        return False
    cursor = today - timedelta(days=1)
    start = min(flags)
    while cursor >= start:
        flag = flags.get(cursor)
        if flag is True:
            return False
        if flag is False:
            return True
        cursor -= timedelta(days=1)
    return False
