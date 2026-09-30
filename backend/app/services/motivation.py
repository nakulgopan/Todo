import hashlib
from datetime import date


POOLS: dict[str, list[str]] = {
    "week": [
        "🔥 One full week completed. Your consistency is becoming a habit.",
        "Seven strong days. You are proving this sticks. 🔥",
        "A full week of follow-through. That is how momentum feels. 🚀",
    ],
    "perfect": [
        "🏆 PERFECT DAY! Nothing left on today's list.",
        "🏆 PERFECT DAY! You cleared the board.",
        "Outstanding! You crushed today's plan! 🔥",
    ],
    "outstanding": [
        "Outstanding! You crushed today's plan! 🔥",
        "This is a strong day. Keep the last few within reach. 🚀",
        "You are close to a perfect day. Finish proud. ⭐",
    ],
    "great": [
        "Great work! You're staying consistent. 🚀",
        "Solid follow-through today. The habit is showing. 🔥",
        "You showed up and moved the day forward. 🚀",
    ],
    "good": [
        "Good progress! You're building the habit. 🔥",
        "You are stacking small wins. Stay with it. 💪",
        "Nice momentum. A little more and today feels lighter. ✨",
    ],
    "small": [
        "Small steps still count. Tomorrow let's do a little more. 💪",
        "You started. That already beats a blank day. 💪",
        "One task down is still progress. Keep the chain alive. 🌱",
    ],
    "improved": [
        "Better than yesterday. That is real progress. 📈",
        "You improved on yesterday. Keep climbing. 🚀",
        "Today is ahead of yesterday. Nice correction. 🔥",
    ],
    "start": [
        "The list is waiting. One task starts the day. 💪",
        "Nothing completed yet. Pick the smallest task and begin. 🌱",
        "A fresh day. Start with one checkbox. ✨",
    ],
    "rest": [
        "No tasks scheduled. Rest is part of the plan. 🌿",
        "Open day. Add something that matters, or enjoy the space. ☀️",
        "Nothing on the books today. Your streak is safe. 🔥",
    ],
}


def _pick(pool: list[str], user_id: str, day: date, bucket: str) -> str:
    digest = hashlib.sha256(f"{user_id}:{day.isoformat()}:{bucket}".encode()).hexdigest()
    return pool[int(digest[:8], 16) % len(pool)]


def motivational_message(
    *,
    user_id: str,
    day: date,
    completion_percentage: int,
    total_points: int,
    completed_tasks: int,
    total_tasks: int,
    is_perfect_day: bool,
    current_streak: int,
    previous_completion_percentage: int | None,
) -> str:
    improved = (
        previous_completion_percentage is not None
        and completion_percentage > previous_completion_percentage
        and not is_perfect_day
        and completed_tasks > 0
    )
    if total_tasks == 0:
        bucket = "rest"
    elif is_perfect_day and current_streak >= 7 and current_streak % 7 == 0:
        bucket = "week"
    elif is_perfect_day:
        bucket = "perfect"
    elif improved:
        bucket = "improved"
    elif completion_percentage >= 80 or total_points >= 100:
        bucket = "outstanding"
    elif completion_percentage >= 60 or current_streak >= 3:
        bucket = "great"
    elif completion_percentage >= 30:
        bucket = "good"
    elif completed_tasks > 0:
        bucket = "small"
    else:
        bucket = "start"
    return _pick(POOLS[bucket], user_id, day, bucket)
