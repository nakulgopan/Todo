from datetime import date

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_database
from app.services.productivity import dashboard, get_daily, history, stats
from app.utils import format_long_date, greeting_for_hour

router = APIRouter(tags=["Dashboard"])


@router.get("/api/dashboard")
def get_dashboard(
    date_value: date | None = Query(default=None, alias="date"),
    hour: int = Query(default=12, ge=0, le=23),
    user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    reference = date.today()
    day = date_value or reference
    if day != reference:
        settings = db.user_settings.find_one({"user_id": user["_id"]}) or {}
        return {
            "greeting": greeting_for_hour(user["name"], hour),
            "name": user["name"],
            "date": day.isoformat(),
            "date_label": format_long_date(day),
            "daily_goal": int(settings.get("daily_goal") or 100),
            "daily": get_daily(db, user["_id"], day, reference, persist=False),
        }
    return dashboard(db, user, day, hour)


@router.get("/api/dashboard/stats")
def get_stats(today: date | None = None, user: dict = Depends(get_current_user), db=Depends(get_database)):
    return stats(db, user["_id"], today or date.today())


@router.get("/api/dashboard/history")
def get_history(
    today: date | None = None,
    days: int = Query(default=60, ge=1, le=366),
    user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    return history(db, user["_id"], today or date.today(), days)
