from datetime import date
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.constants import DEFAULT_POINTS, Priority, RepeatRule, TaskType


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        if not any(character.isalpha() for character in value) or not any(character.isdigit() for character in value):
            raise ValueError("Password must include a letter and a number")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    avatar_url: str | None = None
    created_at: Any
    updated_at: Any


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    priority: Priority = Priority.MEDIUM
    points: int | None = Field(default=None, ge=1, le=500)
    task_type: TaskType
    repeat_rule: RepeatRule = RepeatRule.NONE
    custom_weekdays: list[int] = Field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None
    specific_date: date | None = None

    @field_validator("title", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_schedule(self) -> "TaskCreate":
        validate_task_fields(self)
        return self


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    priority: Priority | None = None
    points: int | None = Field(default=None, ge=1, le=500)
    task_type: TaskType | None = None
    repeat_rule: RepeatRule | None = None
    custom_weekdays: list[int] | None = None
    start_date: date | None = None
    end_date: date | None = None
    specific_date: date | None = None
    is_active: bool | None = None
    clear_end_date: bool = False
    edit_scope: str = "entire"
    occurrence_date: date | None = None

    @field_validator("title", "description")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("edit_scope")
    @classmethod
    def scope_ok(cls, value: str) -> str:
        if value not in {"entire", "occurrence", "future"}:
            raise ValueError("edit_scope must be entire, occurrence, or future")
        return value


class DateAction(BaseModel):
    date: date


class NotificationSettings(BaseModel):
    reminders: bool = True
    achievements: bool = True
    email: bool = False


class DefaultPoints(BaseModel):
    LOW: int = Field(default=DEFAULT_POINTS["LOW"], ge=1, le=500)
    MEDIUM: int = Field(default=DEFAULT_POINTS["MEDIUM"], ge=1, le=500)
    HIGH: int = Field(default=DEFAULT_POINTS["HIGH"], ge=1, le=500)
    URGENT: int = Field(default=DEFAULT_POINTS["URGENT"], ge=1, le=500)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    email: EmailStr | None = None
    avatar_url: str | None = Field(default=None, max_length=500)
    daily_goal: int | None = Field(default=None, ge=1, le=5000)
    theme: str | None = None
    notifications: NotificationSettings | None = None
    default_points: DefaultPoints | None = None

    @field_validator("theme")
    @classmethod
    def theme_ok(cls, value: str | None) -> str | None:
        if value is not None and value not in {"light", "dark", "system"}:
            raise ValueError("Theme must be light, dark, or system")
        return value

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        if not any(character.isalpha() for character in value) or not any(character.isdigit() for character in value):
            raise ValueError("Password must include a letter and a number")
        return value


def validate_task_fields(task: TaskCreate) -> None:
    if task.task_type == TaskType.ONE_TIME:
        if task.specific_date is None:
            raise ValueError("A one-time task needs a specific date")
        task.repeat_rule = RepeatRule.NONE
        task.custom_weekdays = []
        task.start_date = None
        task.end_date = None
        return

    if task.repeat_rule in {RepeatRule.NONE}:
        raise ValueError("A recurring task needs a repeat rule")
    if task.start_date is None:
        raise ValueError("A recurring task needs a start date")
    if task.end_date and task.end_date < task.start_date:
        raise ValueError("End date cannot be before the start date")
    task.specific_date = None
    if task.repeat_rule == RepeatRule.CUSTOM_WEEKDAYS:
        if not task.custom_weekdays:
            raise ValueError("Choose at least one weekday")
        if any(day < 1 or day > 7 for day in task.custom_weekdays):
            raise ValueError("Weekdays must be between 1 (Monday) and 7 (Sunday)")
        task.custom_weekdays = sorted(set(task.custom_weekdays))
    else:
        task.custom_weekdays = []
