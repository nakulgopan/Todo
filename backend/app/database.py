from datetime import date, datetime
from types import SimpleNamespace
from uuid import uuid4

from supabase import Client, create_client

from app.config import settings

_client: Client | None = None


class DuplicateKeyError(Exception):
    pass


def _scalar(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


_COLUMN_ALIASES = {"daily_scores": {"date": "score_date"}}


def _column(table: str, key: str) -> str:
    if key == "_id":
        return "id"
    return _COLUMN_ALIASES.get(table, {}).get(key, key)


def _row_out(table: str, row: dict) -> dict:
    reverse = {column: field for field, column in _COLUMN_ALIASES.get(table, {}).items()}
    document = {}
    for key, value in row.items():
        if key == "id":
            document["_id"] = value
        else:
            document[reverse.get(key, key)] = value
    return document


def _row_in(table: str, document: dict) -> dict:
    row = {}
    for key, value in document.items():
        column = _column(table, key)
        if isinstance(value, datetime):
            row[column] = value.isoformat()
        elif isinstance(value, date):
            row[column] = value.isoformat()
        else:
            row[column] = value
    return row


def _is_duplicate(exc: Exception) -> bool:
    code = str(getattr(exc, "code", "") or "")
    message = str(exc).lower()
    return code == "23505" or "duplicate key" in message or "already exists" in message


class Cursor:
    def __init__(self, rows: list[dict]):
        self.rows = rows

    def sort(self, key: str, direction: int = 1):
        self.rows.sort(key=lambda row: (row.get(key) is None, row.get(key)), reverse=direction < 0)
        return self

    def __iter__(self):
        return iter(self.rows)


class Collection:
    def __init__(self, database: "Database", name: str):
        self.database = database
        self.name = name

    @property
    def table(self):
        return self.database.client.table(self.name)

    def _execute(self, query):
        try:
            return query.execute()
        except Exception as exc:
            if _is_duplicate(exc):
                raise DuplicateKeyError(str(exc)) from exc
            raise

    def _apply(self, query, filt: dict):
        for key, value in filt.items():
            column = _column(self.name, key)
            if isinstance(value, dict):
                if "$ne" in value:
                    query = query.neq(column, _scalar(value["$ne"]))
                elif "$in" in value:
                    query = query.in_(column, [_scalar(item) for item in value["$in"]])
                elif "$gte" in value:
                    query = query.gte(column, _scalar(value["$gte"]))
                elif "$regex" in value:
                    pattern = str(value["$regex"]).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                    query = query.ilike(column, f"%{pattern}%")
                elif "$exists" in value:
                    query = query.not_.is_(column, None) if value["$exists"] else query.is_(column, None)
                else:
                    raise ValueError(f"Unsupported filter on {column}")
            elif value is None:
                query = query.is_(column, "null")
            else:
                query = query.eq(column, _scalar(value))
        return query

    def find(self, filt: dict | None = None, projection: dict | None = None, session=None) -> Cursor:
        del projection, session
        filt = filt or {}
        rows: list[dict] = []
        page_size = 1000
        start = 0
        while True:
            query = self._apply(self.table.select("*"), filt).order("id").range(start, start + page_size - 1)
            batch = self._execute(query).data or []
            rows.extend(_row_out(self.name, item) for item in batch)
            if len(batch) < page_size:
                break
            start += page_size
        return Cursor(rows)

    def find_one(self, filt: dict | None = None, projection: dict | None = None, session=None) -> dict | None:
        del projection, session
        query = self._apply(self.table.select("*"), filt or {}).limit(1)
        rows = self._execute(query).data or []
        return _row_out(self.name, rows[0]) if rows else None

    def insert_one(self, document: dict, session=None):
        del session
        row = _row_in(self.name, document)
        row.setdefault("id", str(uuid4()))
        result = self._execute(self.table.insert(row))
        inserted = (result.data or [row])[0]
        return SimpleNamespace(inserted_id=inserted.get("id") or row["id"])

    def update_one(self, filt: dict, update: dict, upsert: bool = False, session=None):
        del session
        changes = dict(update.get("$set") or {})
        existing = self.find_one(filt)
        if existing:
            if changes:
                self._execute(self.table.update(_row_in(self.name, changes)).eq("id", existing["_id"]))
            return SimpleNamespace(matched_count=1)
        if not upsert:
            return SimpleNamespace(matched_count=0)
        created = {}
        for key, value in filt.items():
            if not isinstance(value, dict):
                created[key] = value
        created.update(update.get("$setOnInsert") or {})
        created.update(changes)
        try:
            self.insert_one(created)
        except DuplicateKeyError:
            existing = self.find_one(filt)
            if not existing:
                raise
            if changes:
                self._execute(self.table.update(_row_in(self.name, changes)).eq("id", existing["_id"]))
        return SimpleNamespace(matched_count=0)

    def delete_many(self, filt: dict, session=None):
        del session
        query = self.table.delete()
        if filt:
            query = self._apply(query, filt)
        else:
            query = query.neq("id", "00000000-0000-0000-0000-000000000000")
        self._execute(query)

    def count_documents(self, filt: dict | None = None, session=None) -> int:
        del session
        query = self._apply(self.table.select("id", count="exact"), filt or {})
        result = self._execute(query.limit(1))
        if result.count is not None:
            return int(result.count)
        return len(list(self.find(filt)))

    def aggregate(self, pipeline: list[dict], session=None):
        del session
        match = {}
        for stage in pipeline:
            if "$match" in stage:
                match = stage["$match"]
        rows = list(self.find(match))
        if not rows:
            return []
        total = sum(int(row.get("total_points") or 0) for row in rows)
        return [{"_id": None, "total": total}]

    def create_index(self, *args, **kwargs):
        del args, kwargs

    def index_information(self) -> dict:
        result = self._execute(self.database.client.rpc("northstar_indexes", {"p_table": self.name}))
        payload = result.data or []
        if isinstance(payload, dict):
            payload = [payload]
        if payload and isinstance(payload, list) and isinstance(payload[0], dict) and "name" not in payload[0]:
            payload = payload[0].get("northstar_indexes") or payload
        info = {}
        for item in payload:
            if not isinstance(item, dict) or "name" not in item:
                continue
            key = [tuple(pair) for pair in item.get("key") or []]
            info[item["name"]] = {"unique": bool(item.get("is_unique")), "key": key}
        return info


class Database:
    def __init__(self, client: Client):
        self.client = client

    def __getitem__(self, name: str) -> Collection:
        return Collection(self, name)

    def __getattr__(self, name: str) -> Collection:
        if name.startswith("_"):
            raise AttributeError(name)
        return Collection(self, name)

    def ping(self) -> None:
        try:
            self.client.table("achievements").select("code").limit(1).execute()
        except Exception as exc:
            message = str(exc)
            if "PGRST205" in message or "schema cache" in message or "Could not find the table" in message:
                raise RuntimeError(
                    "Supabase schema is missing. Run supabase/migrations/20261001000000_northstar.sql in the SQL editor, then restart the API."
                ) from exc
            raise


def get_client() -> Client:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


def user_client(access_token: str) -> Client:
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY are required")
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(access_token)
    return client


def get_db(access_token: str | None = None) -> Database:
    if access_token:
        return Database(user_client(access_token))
    return Database(get_client())


def close_client() -> None:
    global _client
    _client = None


def run_transaction(db: Database, work):
    return work(None)
