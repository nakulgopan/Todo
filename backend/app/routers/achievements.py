from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_database
from app.services.accounts import list_achievements

router = APIRouter(tags=["Achievements"])


@router.get("/api/achievements")
def achievements(user: dict = Depends(get_current_user), db=Depends(get_database)):
    return {"achievements": list_achievements(db, user["_id"])}
