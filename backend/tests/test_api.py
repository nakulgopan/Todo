from datetime import date, timedelta

from app.database import get_db
from tests.conftest import auth_header, create_task, register, supabase_login


def test_register_login_and_me(client):
    created = register(client)
    assert created["token_type"] == "bearer"
    assert created["user"]["email"] == "nakul@example.com"
    assert "password" not in created["user"]
    assert "password_hash" not in created["user"]

    login = supabase_login("Nakul@example.com", "Password1")
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    me = client.get("/api/auth/me", headers=auth_header(token))
    assert me.status_code == 200
    assert me.json()["name"] == "Nakul"
    assert "password_hash" not in me.json()

    logout = client.post("/api/auth/logout", headers=auth_header(token))
    assert logout.status_code == 200

    try:
        get_db().client.auth.admin.create_user(
            {
                "email": "nakul@example.com",
                "password": "Password1",
                "email_confirm": True,
                "user_metadata": {"display_name": "Other"},
            }
        )
        created_again = True
    except Exception:
        created_again = False
    assert created_again is False


def test_invalid_login(client):
    register(client)
    response = supabase_login("nakul@example.com", "wrongpass1")
    assert response.status_code >= 400
    missing = supabase_login("nobody@example.com", "Password1")
    assert missing.status_code >= 400


def test_task_crud_and_filters(client):
    token = register(client)["access_token"]
    created = create_task(client, token, title="Gym", priority="HIGH", points=20)
    one_time = create_task(
        client,
        token,
        title="Buy notebook",
        task_type="ONE_TIME",
        repeat_rule="NONE",
        specific_date="2026-10-02",
        start_date=None,
        points=10,
    )
    listed = client.get("/api/tasks?filter=recurring", headers=auth_header(token))
    assert listed.status_code == 200
    assert [task["title"] for task in listed.json()["tasks"]] == ["Gym"]

    fetched = client.get(f"/api/tasks/{created['id']}", headers=auth_header(token))
    assert fetched.json()["points"] == 20

    updated = client.put(
        f"/api/tasks/{created['id']}",
        json={"title": "Gym session", "edit_scope": "entire"},
        headers=auth_header(token),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Gym session"

    disabled = client.put(
        f"/api/tasks/{one_time['id']}",
        json={"is_active": False, "edit_scope": "entire"},
        headers=auth_header(token),
    )
    assert disabled.json()["is_active"] is False
    active = client.get("/api/tasks?filter=active", headers=auth_header(token))
    assert one_time["id"] not in [task["id"] for task in active.json()["tasks"]]

    removed = client.delete(f"/api/tasks/{created['id']}", headers=auth_header(token))
    assert removed.status_code == 204
    missing = client.get(f"/api/tasks/{created['id']}", headers=auth_header(token))
    assert missing.status_code == 404


def test_recurring_completion_does_not_complete_the_next_day(client):
    token = register(client)["access_token"]
    task = create_task(client, token, start_date="2026-09-28")
    done = client.post(
        f"/api/tasks/{task['id']}/complete",
        json={"date": "2026-09-30"},
        headers=auth_header(token),
    )
    assert done.status_code == 200, done.text
    today = client.get("/api/daily/2026-09-30", headers=auth_header(token))
    tomorrow = client.get("/api/daily/2026-10-01", headers=auth_header(token))
    assert today.json()["tasks"][0]["completed"] is True
    assert tomorrow.json()["tasks"][0]["completed"] is False
    stored = list(get_db().task_completions.find({"user_id": {"$exists": True}}))
    assert len(stored) == 1
    assert stored[0]["completion_date"] == "2026-09-30"
    assert stored[0]["earned_points"] == 15


def test_one_time_task_appears_only_on_its_date(client):
    token = register(client)["access_token"]
    create_task(
        client,
        token,
        title="Buy notebook",
        task_type="ONE_TIME",
        repeat_rule="NONE",
        specific_date="2026-10-02",
        start_date=None,
        points=10,
    )
    assert client.get("/api/daily/2026-10-01", headers=auth_header(token)).json()["custom_tasks"] == []
    target = client.get("/api/daily/2026-10-02", headers=auth_header(token)).json()["custom_tasks"]
    assert len(target) == 1
    assert target[0]["title"] == "Buy notebook"
    assert client.get("/api/daily/2026-10-03", headers=auth_header(token)).json()["custom_tasks"] == []


def test_weekday_rules(client):
    token = register(client)["access_token"]
    create_task(client, token, title="Office", repeat_rule="WEEKDAYS", start_date="2026-09-30")
    create_task(
        client,
        token,
        title="Lift",
        repeat_rule="CUSTOM_WEEKDAYS",
        custom_weekdays=[1, 3],
        start_date="2026-09-30",
    )
    wednesday = client.get("/api/daily/2026-09-30", headers=auth_header(token)).json()
    thursday = client.get("/api/daily/2026-10-01", headers=auth_header(token)).json()
    saturday = client.get("/api/daily/2026-10-03", headers=auth_header(token)).json()
    assert {task["title"] for task in wednesday["tasks"]} == {"Office", "Lift"}
    assert {task["title"] for task in thursday["tasks"]} == {"Office"}
    assert saturday["tasks"] == []


def test_xp_is_calculated_by_the_server(client):
    token = register(client)["access_token"]
    task = create_task(client, token, points=12, specific_date="2026-09-30", task_type="ONE_TIME", repeat_rule="NONE", start_date=None, title="Read")
    response = client.post(
        f"/api/tasks/{task['id']}/complete",
        json={"date": "2026-09-30", "earned_points": 9999},
        headers=auth_header(token),
    )
    body = response.json()["daily"]
    assert body["custom_tasks"][0]["earned_points"] == 12
    assert body["task_points"] == 12
    assert body["bonus_points"] == 50
    assert body["total_points"] == 62
    assert body["is_perfect_day"] is True


def test_perfect_day_bonus_is_awarded_once(client):
    token = register(client)["access_token"]
    first = create_task(client, token, title="Read", points=10, specific_date="2026-09-30", task_type="ONE_TIME", repeat_rule="NONE", start_date=None)
    second = create_task(client, token, title="Write", points=15, specific_date="2026-09-30", task_type="ONE_TIME", repeat_rule="NONE", start_date=None)
    headers = auth_header(token)
    partial = client.post(f"/api/tasks/{first['id']}/complete", json={"date": "2026-09-30"}, headers=headers).json()["daily"]
    assert partial["bonus_points"] == 0
    assert partial["total_points"] == 10
    full = client.post(f"/api/tasks/{second['id']}/complete", json={"date": "2026-09-30"}, headers=headers).json()["daily"]
    assert full["bonus_points"] == 50
    assert full["total_points"] == 75
    again = client.post(f"/api/tasks/{second['id']}/complete", json={"date": "2026-09-30"}, headers=headers).json()["daily"]
    assert again["total_points"] == 75
    assert get_db().daily_scores.count_documents({}) == 1
    undone = client.post(f"/api/tasks/{second['id']}/uncomplete", json={"date": "2026-09-30"}, headers=headers).json()["daily"]
    assert undone["bonus_points"] == 0
    assert undone["total_points"] == 10
    restored = client.post(f"/api/tasks/{second['id']}/complete", json={"date": "2026-09-30"}, headers=headers).json()["daily"]
    assert restored["bonus_points"] == 50
    assert restored["total_points"] == 75
    assert get_db().daily_scores.count_documents({}) == 1


def test_streak_skips_days_without_tasks(client):
    token = register(client)["access_token"]
    headers = auth_header(token)
    today = date.today()
    older = today - timedelta(days=2)
    first = create_task(client, token, title="Older", task_type="ONE_TIME", repeat_rule="NONE", specific_date=older.isoformat(), start_date=None)
    second = create_task(client, token, title="Today", task_type="ONE_TIME", repeat_rule="NONE", specific_date=today.isoformat(), start_date=None)
    client.post(f"/api/tasks/{first['id']}/complete", json={"date": older.isoformat()}, headers=headers)
    body = client.post(
        f"/api/tasks/{second['id']}/complete?today={today.isoformat()}",
        json={"date": today.isoformat()},
        headers=headers,
    ).json()["daily"]
    assert body["streak"]["current"] == 2
    assert body["streak"]["longest"] >= 2


def test_editing_a_task_does_not_rewrite_earned_points(client):
    token = register(client)["access_token"]
    headers = auth_header(token)
    task = create_task(client, token, start_date="2026-09-29", points=15)
    client.post(f"/api/tasks/{task['id']}/complete", json={"date": "2026-09-29"}, headers=headers)
    updated = client.put(
        f"/api/tasks/{task['id']}",
        json={"points": 40, "edit_scope": "entire"},
        headers=headers,
    )
    assert updated.json()["points"] == 40
    yesterday = client.get("/api/daily/2026-09-29", headers=headers).json()
    assert yesterday["tasks"][0]["earned_points"] == 15
    assert yesterday["task_points"] == 15
    today = client.get("/api/daily/2026-09-30", headers=headers).json()
    assert today["tasks"][0]["points"] == 40
    assert today["tasks"][0]["completed"] is False


def test_occurrence_and_future_edits(client):
    token = register(client)["access_token"]
    headers = auth_header(token)
    task = create_task(client, token, title="Gym", start_date="2026-09-28")
    client.post(f"/api/tasks/{task['id']}/complete", json={"date": "2026-09-29"}, headers=headers)
    occurrence = client.put(
        f"/api/tasks/{task['id']}",
        json={"title": "Gym - travel day", "edit_scope": "occurrence", "occurrence_date": "2026-09-30"},
        headers=headers,
    )
    assert occurrence.status_code == 200, occurrence.text
    assert client.get("/api/daily/2026-09-30", headers=headers).json()["tasks"][0]["title"] == "Gym - travel day"
    assert client.get("/api/daily/2026-10-01", headers=headers).json()["tasks"][0]["title"] == "Gym"
    assert client.get("/api/daily/2026-09-29", headers=headers).json()["tasks"][0]["earned_points"] == 15

    future = client.put(
        f"/api/tasks/{task['id']}",
        json={"title": "Morning gym", "edit_scope": "future", "occurrence_date": "2026-10-02"},
        headers=headers,
    )
    assert future.status_code == 200, future.text
    assert future.json()["id"] != task["id"]
    assert client.get("/api/daily/2026-10-01", headers=headers).json()["tasks"][0]["title"] == "Gym"
    assert client.get("/api/daily/2026-10-02", headers=headers).json()["tasks"][0]["title"] == "Morning gym"
    assert client.get("/api/daily/2026-09-29", headers=headers).json()["task_points"] == 15


def test_achievements_are_awarded_once(client):
    token = register(client)["access_token"]
    headers = auth_header(token)
    task = create_task(client, token, title="Read", task_type="ONE_TIME", repeat_rule="NONE", specific_date="2026-09-30", start_date=None)
    first = client.post(f"/api/tasks/{task['id']}/complete", json={"date": "2026-09-30"}, headers=headers).json()
    codes = {item["code"] for item in first["unlocked_achievements"]}
    assert "FIRST_TASK" in codes
    assert "FIRST_PERFECT_DAY" in codes
    second = client.post(f"/api/tasks/{task['id']}/complete", json={"date": "2026-09-30"}, headers=headers).json()
    assert second["unlocked_achievements"] == []
    assert get_db().user_achievements.count_documents({"achievement_code": "FIRST_TASK"}) == 1
    catalog = client.get("/api/achievements", headers=headers).json()["achievements"]
    assert len(catalog) == 10
    unlocked = [item for item in catalog if item["unlocked"]]
    assert {item["code"] for item in unlocked} >= {"FIRST_TASK", "FIRST_PERFECT_DAY"}


def test_users_cannot_see_each_other(client):
    first = register(client, email="one@example.com", name="One")
    second = register(client, email="two@example.com", name="Two")
    task = create_task(client, first["access_token"], title="Private")
    headers = auth_header(second["access_token"])
    assert client.get(f"/api/tasks/{task['id']}", headers=headers).status_code == 404
    assert client.put(f"/api/tasks/{task['id']}", json={"title": "Stolen"}, headers=headers).status_code == 404
    assert client.delete(f"/api/tasks/{task['id']}", headers=headers).status_code == 404
    assert client.post(f"/api/tasks/{task['id']}/complete", json={"date": "2026-09-30"}, headers=headers).status_code == 404
    daily = client.get("/api/daily/2026-09-30", headers=headers).json()
    assert daily["tasks"] == []
    profile = client.get("/api/profile", headers=headers).json()
    assert profile["user"]["email"] == "two@example.com"
    other_tasks = client.get("/api/tasks", headers=headers).json()["tasks"]
    assert other_tasks == []


def test_required_indexes_exist(client):
    database = get_db()
    completion_indexes = database.task_completions.index_information()
    assert any(
        info.get("unique") and info.get("key") == [("task_id", 1), ("completion_date", 1)]
        for info in completion_indexes.values()
    )
    score_indexes = database.daily_scores.index_information()
    assert any(
        info.get("unique") and info.get("key") == [("user_id", 1), ("score_date", 1)]
        for info in score_indexes.values()
    )
    task_indexes = database.tasks.index_information()
    keys = [info.get("key") for info in task_indexes.values()]
    assert [("user_id", 1)] in keys
    assert [("user_id", 1), ("is_active", 1)] in keys
    assert [("user_id", 1), ("task_type", 1)] in keys
    assert [("user_id", 1), ("specific_date", 1)] in keys
    assert any(info.get("key") == [("user_id", 1)] for info in database.user_achievements.index_information().values())
