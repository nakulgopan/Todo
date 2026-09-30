from collections import defaultdict, deque
import time

from fastapi import Request

from app.config import settings
from app.errors import AppError

_hits: dict[str, deque[float]] = defaultdict(deque)


def enforce_auth_rate_limit(request: Request) -> None:
    limit = settings.auth_rate_limit
    window = settings.auth_rate_window_seconds
    if limit <= 0:
        return
    host = request.client.host if request.client else "unknown"
    key = f"auth:{host}"
    now = time.monotonic()
    bucket = _hits[key]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise AppError(429, "Too many authentication attempts. Try again shortly.")
    bucket.append(now)


def reset_rate_limits() -> None:
    _hits.clear()
