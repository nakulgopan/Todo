from enum import Enum

PERFECT_DAY_BONUS = 50
STREAK_LOOKBACK_DAYS = 366 * 3


class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class TaskType(str, Enum):
    ONE_TIME = "ONE_TIME"
    RECURRING = "RECURRING"


class RepeatRule(str, Enum):
    NONE = "NONE"
    DAILY = "DAILY"
    WEEKDAYS = "WEEKDAYS"
    CUSTOM_WEEKDAYS = "CUSTOM_WEEKDAYS"


DEFAULT_POINTS = {
    Priority.LOW.value: 10,
    Priority.MEDIUM.value: 15,
    Priority.HIGH.value: 20,
    Priority.URGENT.value: 30,
}

PRIORITY_RANK = {
    Priority.URGENT.value: 0,
    Priority.HIGH.value: 1,
    Priority.MEDIUM.value: 2,
    Priority.LOW.value: 3,
}

ACHIEVEMENT_CATALOG = [
    {
        "code": "FIRST_TASK",
        "name": "First Step",
        "description": "Complete your first task",
        "icon": "flag",
        "requirement": "Complete 1 task",
    },
    {
        "code": "FIRST_PERFECT_DAY",
        "name": "Perfect Day",
        "description": "Complete every task scheduled for a day",
        "icon": "emoji_events",
        "requirement": "Finish a perfect day",
    },
    {
        "code": "THREE_DAY_STREAK",
        "name": "Hat Trick",
        "description": "Reach a 3-day streak",
        "icon": "local_fire_department",
        "requirement": "Reach a 3-day streak",
    },
    {
        "code": "SEVEN_DAY_STREAK",
        "name": "Full Week",
        "description": "Reach a 7-day streak",
        "icon": "local_fire_department",
        "requirement": "Reach a 7-day streak",
    },
    {
        "code": "THIRTY_DAY_STREAK",
        "name": "Iron Month",
        "description": "Reach a 30-day streak",
        "icon": "military_tech",
        "requirement": "Reach a 30-day streak",
    },
    {
        "code": "ONE_HUNDRED_TASKS",
        "name": "Centurion",
        "description": "Complete 100 tasks",
        "icon": "task_alt",
        "requirement": "Complete 100 tasks",
    },
    {
        "code": "FIVE_HUNDRED_XP",
        "name": "Rising",
        "description": "Earn 500 XP",
        "icon": "star",
        "requirement": "Earn 500 XP",
    },
    {
        "code": "ONE_THOUSAND_XP",
        "name": "Thousand Club",
        "description": "Earn 1,000 XP",
        "icon": "stars",
        "requirement": "Earn 1,000 XP",
    },
    {
        "code": "PERFECT_WEEK",
        "name": "Perfect Week",
        "description": "Complete every scheduled task across a Monday–Sunday week",
        "icon": "workspace_premium",
        "requirement": "Complete a perfect Monday–Sunday week",
    },
    {
        "code": "COMEBACK",
        "name": "Comeback",
        "description": "Finish a perfect day after a missed day",
        "icon": "replay",
        "requirement": "Finish a perfect day after a missed day",
    },
]
