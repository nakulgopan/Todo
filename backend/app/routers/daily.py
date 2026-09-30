from datetime import date

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_database
from app.errors import AppError
from app.services.productivity import get_daily
from app.utils import parse_date

router = APIRouter(tags=["Daily"])


def _parse_day(value: str) -> date:
    parsed = parse_date(value)
    if parsed is None:
        raise AppError(400, "Date must be YYYY-MM-DD")
    return parsed


@router.get("/api/daily/{day}")
def daily(day: str, today: date | None = None, user: dict = Depends(get_current_user), db=Depends(get_database)):
    target = _parse_day(day)
    reference = today or date.today()
    return get_daily(db, user["_id"], target, reference, persist=target == reference)
