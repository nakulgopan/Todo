from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_database
from app.schemas.models import PasswordChange, ProfileUpdate
from app.services.accounts import change_password, get_profile, update_profile

router = APIRouter(tags=["Profile"])


@router.get("/api/profile")
def profile(user: dict = Depends(get_current_user), db=Depends(get_database)):
    return get_profile(db, user)


@router.put("/api/profile")
def put_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user), db=Depends(get_database)):
    return update_profile(db, user, payload)


@router.put("/api/profile/password")
def put_password(payload: PasswordChange, user: dict = Depends(get_current_user)):
    change_password(user, payload)
    return {"detail": "Password updated"}
