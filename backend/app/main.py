import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.bootstrap import ensure_indexes, seed_achievements
from app.config import settings
from app.database import close_client, get_db
from app.errors import AppError
from app.routers import achievements, auth, calendar, daily, dashboard, profile, tasks

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("northstar")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    database = get_db()
    database.ping()
    ensure_indexes(database)
    seed_achievements(database)
    logger.info("Northstar API ready")
    yield
    close_client()


app = FastAPI(
    title="Northstar",
    summary="Personal to-do and productivity API",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(daily.router)
app.include_router(dashboard.router)
app.include_router(calendar.router)
app.include_router(achievements.router)
app.include_router(profile.router)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    logger.info("%s %s %s", request.method, request.url.path, response.status_code)
    return response


@app.get("/api/health", tags=["Health"])
def health():
    get_db().ping()
    return {"status": "ok"}
