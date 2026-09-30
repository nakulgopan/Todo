from datetime import date

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_database
from app.schemas.models import DateAction, TaskCreate, TaskUpdate
from app.services.productivity import complete_task, uncomplete_task
from app.services.tasks import create_task, delete_task, get_owned_task, list_tasks, serialize_task, update_task

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.get("")
def get_tasks(
    task_filter: str = Query(default="all", alias="filter"),
    search: str = "",
    sort: str = "priority",
    order: str = "asc",
    user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    return {
        "tasks": list_tasks(
            db,
            user["_id"],
            task_filter=task_filter,
            search=search,
            sort=sort,
            order=order,
        )
    }


@router.post("", status_code=201)
def post_task(payload: TaskCreate, user: dict = Depends(get_current_user), db=Depends(get_database)):
    return create_task(db, user["_id"], payload)


@router.get("/{task_id}")
def get_task(task_id: str, user: dict = Depends(get_current_user), db=Depends(get_database)):
    return serialize_task(get_owned_task(db, user["_id"], task_id))


@router.put("/{task_id}")
def put_task(task_id: str, payload: TaskUpdate, user: dict = Depends(get_current_user), db=Depends(get_database)):
    return update_task(db, user["_id"], task_id, payload)


@router.delete("/{task_id}", status_code=204)
def remove_task(
    task_id: str,
    scope: str = Query(default="entire"),
    occurrence_date: date | None = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    if scope not in {"entire", "occurrence", "future"}:
        from app.errors import AppError

        raise AppError(400, "Unknown delete scope")
    delete_task(db, user["_id"], task_id, scope, occurrence_date)


@router.post("/{task_id}/complete")
def complete(
    task_id: str,
    payload: DateAction,
    today: date | None = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    reference = today or date.today()
    return complete_task(db, user["_id"], task_id, payload.date, reference)


@router.post("/{task_id}/uncomplete")
def uncomplete(
    task_id: str,
    payload: DateAction,
    today: date | None = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    reference = today or date.today()
    return uncomplete_task(db, user["_id"], task_id, payload.date, reference)
