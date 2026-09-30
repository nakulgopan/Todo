# Northstar

Personal to-do and productivity app. Angular handles the interface and Supabase Auth. FastAPI resolves recurring tasks, XP, streaks, and achievements. Supabase Postgres stores the data, and row level security limits every user to their own rows.

Passwords are stored only by Supabase Auth. The app database does not contain password hashes.

## Requirements

- Node.js 22+
- Python 3.12+
- A Supabase project

There is no Docker setup and no local database.

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In Authentication → Providers, keep Email enabled.
3. For local testing, turn off “Confirm email” so a new account receives a session immediately.
4. Open the SQL editor and run `supabase/migrations/20261001000000_northstar.sql`.

That file creates `profiles`, `tasks`, `task_completions`, `daily_scores`, `achievements`, `user_achievements`, `user_settings`, and `task_overrides`, plus indexes, the profile trigger, and row level security policies.

Weekdays are stored as `1` Monday through `7` Sunday.

## 2. Environment variables

Copy the examples and fill in the project URL and keys from Supabase → Project Settings → API.

Backend, from the repo root `.env` (the API reads this file):

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=server_only_if_required
FRONTEND_URL=http://localhost:4200
CORS_ORIGINS=http://localhost:4200,http://localhost
```

`SUPABASE_SERVICE_ROLE_KEY` stays on the server. It is used to seed the achievement catalog and to clean test users. Request handling uses the anon key plus the caller’s Supabase access token, so row level security applies.

Frontend: `frontend/src/environments/environment.ts`

```text
supabaseUrl
supabaseAnonKey
```

Do not put the service role key in the frontend.

## 3. Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

## 4. Run the frontend

```bash
cd frontend
npm install
npx ng serve
```

App: http://localhost:4200

The dev server proxies `/api` to http://localhost:8000.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/me` | Current profile from the Supabase access token |
| POST | `/api/auth/logout` | Acknowledges logout. The session is cleared in the browser |
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/{id}` | Read one task |
| PUT | `/api/tasks/{id}` | Edit a task, including occurrence / future / entire scope |
| DELETE | `/api/tasks/{id}` | Delete or skip a task |
| POST | `/api/tasks/{id}/complete` | Complete a task on a date |
| POST | `/api/tasks/{id}/uncomplete` | Clear that date’s completion |
| GET | `/api/daily/{date}` | Tasks, XP, streak, and message for a date |
| GET | `/api/dashboard` | Today’s dashboard |
| GET | `/api/dashboard/stats` | Weekly and monthly statistics |
| GET | `/api/dashboard/history` | Recent days |
| GET | `/api/calendar/{year}/{month}` | Month summary |
| GET | `/api/achievements` | Catalog and unlocks |
| GET | `/api/profile` | Profile and settings |
| PUT | `/api/profile` | Update name, avatar, email, and settings |
| PUT | `/api/profile/password` | Change password through Supabase Auth |
| GET | `/api/health` | Database reachability |

Sign-up and sign-in happen in the browser with the Supabase client. FastAPI checks the access token with `GET /auth/v1/user` before any protected route.

## Database and row level security

User-owned tables use `user_id = auth.uid()`, except `profiles`, which uses `id = auth.uid()`. `achievements` is a shared catalog: signed-in users can read it and cannot change it.

The anon key cannot read these tables. The service role bypasses row level security and is not shipped to Angular.

A database trigger creates a profile and default settings when Supabase Auth inserts a user.

Completions are one row per task and date. A daily task completed on 30 September is still incomplete on 1 October. One-time tasks appear only on `specific_date`.

XP, the +50 perfect-day bonus, streaks, and achievements are calculated on the server. Empty days do not break a streak.

## Tests

Backend tests call the real Supabase project and delete `@example.com` users afterward. Do not point them at data you need to keep. Email confirmation must be off.

```bash
cd backend
.venv\Scripts\python -m pytest
```

```bash
cd frontend
npm test
npx ng build
```

## Production

Build the Angular app with `npx ng build` and host the `frontend/dist/frontend/browser` output behind any static host. Run Uvicorn behind a process manager and set `CORS_ORIGINS` to the public site origin. Run the SQL migration on the production Supabase project before starting the API. Keep the service role key in the server environment only.

## Limitations

- Email and password changes go through Supabase Auth. If email confirmation is on, a new address is not active until the user confirms it.
- Notification preferences are stored only. The app does not send email or push notifications.
- Avatar is a URL, not a file upload.
- Streak history looks back three years.
- Multi-row score updates are sequential PostgREST calls. Unique constraints stop a second perfect-day bonus for the same user and date.
