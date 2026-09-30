from app.constants import ACHIEVEMENT_CATALOG


def ensure_indexes(db) -> None:
    db.users.create_index("email", unique=True, name="users_email_unique")
    db.tasks.create_index("user_id", name="tasks_user_id")
    db.tasks.create_index([("user_id", 1), ("is_active", 1)], name="tasks_user_active")
    db.tasks.create_index([("user_id", 1), ("task_type", 1)], name="tasks_user_type")
    db.tasks.create_index([("user_id", 1), ("specific_date", 1)], name="tasks_user_specific_date")
    db.task_completions.create_index(
        [("user_id", 1), ("completion_date", 1)],
        name="completions_user_date",
    )
    db.task_completions.create_index(
        [("task_id", 1), ("completion_date", 1)],
        unique=True,
        name="completions_task_date_unique",
    )
    db.daily_scores.create_index(
        [("user_id", 1), ("date", 1)],
        unique=True,
        name="scores_user_date_unique",
    )
    db.user_achievements.create_index("user_id", name="user_achievements_user_id")
    db.user_achievements.create_index(
        [("user_id", 1), ("achievement_code", 1)],
        unique=True,
        name="user_achievements_code_unique",
    )
    db.achievements.create_index("code", unique=True, name="achievements_code_unique")
    db.user_settings.create_index("user_id", unique=True, name="settings_user_unique")
    db.task_overrides.create_index(
        [("task_id", 1), ("override_date", 1)],
        unique=True,
        name="overrides_task_date_unique",
    )
    db.task_overrides.create_index("user_id", name="overrides_user_id")


def seed_achievements(db) -> None:
    for item in ACHIEVEMENT_CATALOG:
        db.achievements.update_one({"code": item["code"]}, {"$set": item}, upsert=True)
