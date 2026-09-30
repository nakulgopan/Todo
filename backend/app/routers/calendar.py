from datetime import date

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_database
from app.services.productivity import calendar_month

router = APIRouter(tags=["Calendar"])


@router.get("/api/calendar/{year}/{month}")
def get_calendar(
    year: int,
    month: int,
    today: date | None = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    return calendar_month(db, user["_id"], year, month, today or date.today())
