from fastapi import APIRouter, Depends, Request

from app.database import get_client, get_db
from app.dependencies import get_current_user
from app.dependencies.auth import sign_in_with_password
from app.errors import AppError
from app.rate_limit import enforce_auth_rate_limit
from app.schemas.models import AuthResponse, LoginRequest, RegisterRequest, UserOut
from app.utils import public_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _session_response(email: str, password: str) -> AuthResponse:
    session = sign_in_with_password(email, password)
    user = get_current_user(session["access_token"], get_db(session["access_token"]))
    return AuthResponse(access_token=session["access_token"], user=public_user(user))


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, request: Request):
    enforce_auth_rate_limit(request)
    email = payload.email.lower()
    try:
        get_client().auth.admin.create_user(
            {
                "email": email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {"display_name": payload.name},
            }
        )
    except Exception as exc:
        message = str(exc).lower()
        if "already" in message or "registered" in message or "exists" in message:
            raise AppError(409, "An account with this email already exists") from exc
        detail = getattr(exc, "message", None) or "Could not create the account"
        raise AppError(400, str(detail)) from exc
    return _session_response(email, payload.password)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request):
    enforce_auth_rate_limit(request)
    return _session_response(payload.email.lower(), payload.password)


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/logout")
def logout(_user: dict = Depends(get_current_user)):
    return {"detail": "Logged out"}
