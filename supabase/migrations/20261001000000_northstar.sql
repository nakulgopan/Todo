-- Northstar schema, indexes, and row level security.
-- Run this once in the Supabase SQL editor.
-- Weekdays are 1 = Monday through 7 = Sunday.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_goal integer not null default 100,
  default_points jsonb not null default '{"LOW":10,"MEDIUM":15,"HIGH":20,"URGENT":30}'::jsonb,
  theme text not null default 'system',
  notifications jsonb not null default '{"reminders":true,"achievements":true,"email":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_user_unique unique (user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'MEDIUM',
  points integer not null,
  task_type text not null,
  repeat_rule text not null,
  custom_weekdays integer[] not null default '{}',
  start_date date,
  end_date date,
  specific_date date,
  is_active boolean not null default true,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id on public.tasks (user_id);
create index if not exists tasks_user_active on public.tasks (user_id, is_active);
create index if not exists tasks_user_type on public.tasks (user_id, task_type);
create index if not exists tasks_user_specific_date on public.tasks (user_id, specific_date);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completion_date date not null,
  completed boolean not null,
  completed_at timestamptz,
  earned_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completions_task_date_unique unique (task_id, completion_date)
);

create index if not exists completions_user_date on public.task_completions (user_id, completion_date);

create table if not exists public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score_date date not null,
  task_points integer not null,
  bonus_points integer not null,
  total_points integer not null,
  completed_tasks integer not null,
  total_tasks integer not null,
  completion_percentage numeric not null,
  is_perfect_day boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scores_user_date_unique unique (user_id, score_date)
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text not null,
  icon text not null,
  requirement text not null,
  constraint achievements_code_unique unique (code)
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid references public.achievements (id),
  achievement_code text not null,
  unlocked_at timestamptz not null default now(),
  constraint user_achievements_code_unique unique (user_id, achievement_code)
);

create index if not exists user_achievements_user_id on public.user_achievements (user_id);

create table if not exists public.task_overrides (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  override_date date not null,
  title text,
  description text,
  priority text,
  points integer,
  is_skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overrides_task_date_unique unique (task_id, override_date)
);

create index if not exists overrides_user_id on public.task_overrides (user_id);

insert into public.achievements (code, name, description, icon, requirement)
values
  ('FIRST_TASK', 'First Step', 'Complete your first task', 'flag', 'Complete 1 task'),
  ('FIRST_PERFECT_DAY', 'Perfect Day', 'Complete every task scheduled for a day', 'emoji_events', 'Finish a perfect day'),
  ('THREE_DAY_STREAK', 'Hat Trick', 'Reach a 3-day streak', 'local_fire_department', 'Reach a 3-day streak'),
  ('SEVEN_DAY_STREAK', 'Full Week', 'Reach a 7-day streak', 'local_fire_department', 'Reach a 7-day streak'),
  ('THIRTY_DAY_STREAK', 'Iron Month', 'Reach a 30-day streak', 'military_tech', 'Reach a 30-day streak'),
  ('ONE_HUNDRED_TASKS', 'Centurion', 'Complete 100 tasks', 'task_alt', 'Complete 100 tasks'),
  ('FIVE_HUNDRED_XP', 'Rising', 'Earn 500 XP', 'star', 'Earn 500 XP'),
  ('ONE_THOUSAND_XP', 'Thousand Club', 'Earn 1,000 XP', 'stars', 'Earn 1,000 XP'),
  ('PERFECT_WEEK', 'Perfect Week', 'Complete every scheduled task across a Monday–Sunday week', 'workspace_premium', 'Complete a perfect Monday–Sunday week'),
  ('COMEBACK', 'Comeback', 'Finish a perfect day after a missed day', 'replay', 'Finish a perfect day after a missed day')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    requirement = excluded.requirement;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.northstar_indexes(p_table text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', i.relname,
    'is_unique', ix.indisunique,
    'key', (
      select jsonb_agg(jsonb_build_array(a.attname, 1) order by k.ord)
      from unnest(ix.indkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = k.attnum
      where k.attnum > 0
    )
  )), '[]'::jsonb)
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = p_table;
$$;

revoke all on function public.northstar_indexes(text) from public, anon, authenticated;
grant execute on function public.northstar_indexes(text) to service_role;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'profiles',
    'user_settings',
    'tasks',
    'task_completions',
    'daily_scores',
    'achievements',
    'user_achievements',
    'task_overrides'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on table public.%I from anon, authenticated', tbl);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', tbl);
  end loop;
end $$;

revoke insert, update, delete on public.achievements from authenticated;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on public.profiles for delete to authenticated using (id = auth.uid());

drop policy if exists settings_all on public.user_settings;
create policy settings_all on public.user_settings for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists completions_all on public.task_completions;
create policy completions_all on public.task_completions for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists scores_all on public.daily_scores;
create policy scores_all on public.daily_scores for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists achievements_read on public.achievements;
create policy achievements_read on public.achievements for select to authenticated using (true);

drop policy if exists user_achievements_all on public.user_achievements;
create policy user_achievements_all on public.user_achievements for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists overrides_all on public.task_overrides;
create policy overrides_all on public.task_overrides for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
