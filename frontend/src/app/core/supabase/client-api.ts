import {
  Achievement,
  AuthResponse,
  CalendarMonth,
  CompletionResult,
  DailyView,
  DashboardView,
  HistoryItem,
  Profile,
  StatsView,
  Task,
  TaskPayload,
  User,
  UserSettings,
} from '../models/models';
import { supabaseBrowser } from './browser';
import {
  ACHIEVEMENT_CATALOG,
  Schedule,
  StoredCompletion,
  StoredOverride,
  StoredScore,
  StoredTask,
  addDays,
  buildFlags,
  computeStreaks,
  eligibleCodes,
  formatLongDate,
  hasPerfectWeek,
  isComeback,
  monthLabel,
  motivation,
  scoreFromTasks,
  summaryFor,
} from './engine';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function userId(): Promise<{ id: string; email: string }> {
  const { data, error } = await supabaseBrowser().auth.getUser();
  fail(error);
  if (!data.user) throw new Error('Not authenticated');
  return { id: data.user.id, email: data.user.email || '' };
}

async function rows<T>(table: string, userColumn: string, id: string): Promise<T[]> {
  const { data, error } = await supabaseBrowser().from(table).select('*').eq(userColumn, id).limit(1000);
  fail(error);
  return (data || []) as T[];
}

function asTask(row: StoredTask): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    priority: row.priority,
    points: Number(row.points),
    task_type: row.task_type,
    repeat_rule: row.repeat_rule as Task['repeat_rule'],
    custom_weekdays: [...(row.custom_weekdays || [])],
    start_date: row.start_date,
    end_date: row.end_date,
    specific_date: row.specific_date,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeTask(row: StoredTask): StoredTask {
  return {
    ...row,
    points: Number(row.points),
    custom_weekdays: row.custom_weekdays || [],
    description: row.description || '',
    deleted: Boolean(row.deleted),
    is_active: row.is_active !== false,
  };
}

async function loadSchedule(id: string): Promise<Schedule> {
  const [tasks, overrides, completions, scores] = await Promise.all([
    rows<StoredTask>('tasks', 'user_id', id),
    rows<StoredOverride>('task_overrides', 'user_id', id),
    rows<StoredCompletion>('task_completions', 'user_id', id),
    rows<StoredScore>('daily_scores', 'user_id', id),
  ]);
  return new Schedule(tasks.map(normalizeTask), overrides, completions, scores.map((score) => ({
    ...score,
    score_date: String(score.score_date).slice(0, 10),
    completion_percentage: Number(score.completion_percentage),
  })));
}

async function saveScore(id: string, day: string, summary: ReturnType<typeof scoreFromTasks>): Promise<void> {
  const now = new Date().toISOString();
  const existing = await supabaseBrowser().from('daily_scores').select('id').eq('user_id', id).eq('score_date', day).maybeSingle();
  fail(existing.error);
  const payload = { ...summary, user_id: id, score_date: day, updated_at: now };
  if (existing.data?.id) {
    fail((await supabaseBrowser().from('daily_scores').update(payload).eq('id', existing.data.id)).error);
  } else {
    fail((await supabaseBrowser().from('daily_scores').insert({ ...payload, created_at: now })).error);
  }
}

async function buildDaily(schedule: Schedule, id: string, day: string, today: string): Promise<DailyView> {
  const tasks = schedule.resolve(day);
  const summary = scoreFromTasks(tasks);
  const flags = buildFlags(schedule, today, new Set(day <= today ? [day] : []));
  const streak = computeStreaks(flags, today);
  const previous = summaryFor(schedule, addDays(day, -1), today, true);
  const previousPercentage = previous.total_tasks === 0 ? null : previous.completion_percentage;
  return {
    date: day,
    tasks: tasks.filter((task) => task.task_type === 'RECURRING'),
    custom_tasks: tasks.filter((task) => task.task_type === 'ONE_TIME'),
    ...summary,
    streak,
    motivation: await motivation({
      userId: id,
      day,
      completionPercentage: summary.completion_percentage,
      totalPoints: summary.total_points,
      completedTasks: summary.completed_tasks,
      totalTasks: summary.total_tasks,
      isPerfectDay: summary.is_perfect_day,
      currentStreak: streak.current,
      previous: previousPercentage,
    }),
    previous_completion_percentage: previousPercentage,
  };
}

function publicSettings(row: Partial<UserSettings> | null): UserSettings {
  return {
    daily_goal: Number(row?.daily_goal ?? 100),
    default_points: row?.default_points || { LOW: 10, MEDIUM: 15, HIGH: 20, URGENT: 30 },
    theme: row?.theme || 'system',
    notifications: row?.notifications || { reminders: true, achievements: true, email: false },
  };
}

async function currentProfile(): Promise<Profile> {
  const account = await userId();
  const { data: authData } = await supabaseBrowser().auth.getUser();
  const metadata = authData.user?.user_metadata || {};
  let profile = (await supabaseBrowser().from('profiles').select('*').eq('id', account.id).maybeSingle()).data;
  if (!profile) {
    const now = new Date().toISOString();
    const displayName = metadata['display_name'] || account.email.split('@')[0] || 'User';
    fail((await supabaseBrowser().from('profiles').insert({ id: account.id, display_name: displayName, created_at: now, updated_at: now })).error);
    profile = { display_name: displayName, avatar_url: null, created_at: now, updated_at: now };
  }
  let settings = (await supabaseBrowser().from('user_settings').select('*').eq('user_id', account.id).maybeSingle()).data;
  if (!settings) {
    const now = new Date().toISOString();
    const defaults = publicSettings(null);
    fail((await supabaseBrowser().from('user_settings').insert({ user_id: account.id, ...defaults, created_at: now, updated_at: now })).error);
    settings = defaults;
  }
  const user: User = {
    id: account.id,
    name: profile.display_name,
    email: account.email,
    avatar_url: profile.avatar_url,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
  return { user, settings: publicSettings(settings) };
}

function validateTask(payload: TaskPayload): TaskPayload {
  const next = { ...payload, custom_weekdays: [...(payload.custom_weekdays || [])] };
  if (!next.title?.trim()) throw new Error('Name is required');
  if (next.task_type === 'ONE_TIME') {
    if (!next.specific_date) throw new Error('A one-time task needs a specific date');
    next.repeat_rule = 'NONE';
    next.custom_weekdays = [];
    next.start_date = null;
    next.end_date = null;
    return next;
  }
  if (next.repeat_rule === 'NONE') throw new Error('A recurring task needs a repeat rule');
  if (!next.start_date) throw new Error('A recurring task needs a start date');
  if (next.end_date && next.start_date && next.end_date < next.start_date) throw new Error('End date cannot be before the start date');
  next.specific_date = null;
  if (next.repeat_rule === 'CUSTOM_WEEKDAYS') {
    if (!next.custom_weekdays.length) throw new Error('Choose at least one weekday');
    if (next.custom_weekdays.some((day) => day < 1 || day > 7)) throw new Error('Weekdays must be between 1 (Monday) and 7 (Sunday)');
    next.custom_weekdays = [...new Set(next.custom_weekdays)].sort((left, right) => left - right);
  } else {
    next.custom_weekdays = [];
  }
  return next;
}

async function ownedTask(id: string, taskId: string): Promise<StoredTask> {
  const { data, error } = await supabaseBrowser().from('tasks').select('*').eq('id', taskId).eq('user_id', id).eq('deleted', false).maybeSingle();
  fail(error);
  if (!data) throw new Error('Task not found');
  return normalizeTask(data as StoredTask);
}

export const directApi = {
  async login(payload: { email: string; password: string }): Promise<AuthResponse> {
    const { data, error } = await supabaseBrowser().auth.signInWithPassword({ email: payload.email, password: payload.password });
    if (error || !data.session) throw new Error(error?.message || 'Invalid email or password');
    const profile = await currentProfile();
    return { access_token: data.session.access_token, token_type: 'bearer', user: profile.user };
  },

  async register(payload: { name: string; email: string; password: string }): Promise<AuthResponse> {
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: payload.email,
      password: payload.password,
      options: { data: { display_name: payload.name } },
    });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Check your email to confirm the account, then sign in.');
    const profile = await currentProfile();
    return { access_token: data.session.access_token, token_type: 'bearer', user: profile.user };
  },

  async me(): Promise<User> {
    return (await currentProfile()).user;
  },

  async listTasks(filter: string, search: string, sort: string, order: string): Promise<{ tasks: Task[] }> {
    const { id } = await userId();
    let items = (await rows<StoredTask>('tasks', 'user_id', id)).map(normalizeTask).filter((task) => !task.deleted);
    if (filter === 'active') items = items.filter((task) => task.is_active);
    else if (filter === 'recurring') items = items.filter((task) => task.task_type === 'RECURRING');
    else if (filter === 'one_time') items = items.filter((task) => task.task_type === 'ONE_TIME');
    else if (filter === 'high_priority') items = items.filter((task) => task.priority === 'HIGH' || task.priority === 'URGENT');
    else if (filter !== 'all') throw new Error('Unknown task filter');
    const needle = search.trim().toLowerCase();
    if (needle) items = items.filter((task) => task.title.toLowerCase().includes(needle));
    const direction = order === 'desc' ? -1 : 1;
    const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    items.sort((left, right) => {
      if (sort === 'created') return left.created_at.localeCompare(right.created_at) * direction;
      if (sort === 'points') return (left.points - right.points) * direction;
      if (sort === 'title') return left.title.localeCompare(right.title) * direction;
      if (sort === 'priority') return ((rank[left.priority] ?? 9) - (rank[right.priority] ?? 9) || left.title.localeCompare(right.title)) * direction;
      throw new Error('Unknown sort');
    });
    return { tasks: items.map(asTask) };
  },

  async createTask(payload: TaskPayload): Promise<Task> {
    const { id } = await userId();
    const valid = validateTask(payload);
    const settings = (await supabaseBrowser().from('user_settings').select('default_points').eq('user_id', id).maybeSingle()).data;
    const defaults = publicSettings(settings as UserSettings | null).default_points;
    const now = new Date().toISOString();
    const { data, error } = await supabaseBrowser().from('tasks').insert({
      user_id: id,
      title: valid.title.trim(),
      description: valid.description || '',
      priority: valid.priority,
      points: valid.points ?? defaults[valid.priority],
      task_type: valid.task_type,
      repeat_rule: valid.repeat_rule,
      custom_weekdays: valid.custom_weekdays,
      start_date: valid.start_date,
      end_date: valid.end_date,
      specific_date: valid.specific_date,
      is_active: true,
      deleted: false,
      created_at: now,
      updated_at: now,
    }).select('*').single();
    fail(error);
    return asTask(normalizeTask(data as StoredTask));
  },

  async updateTask(taskId: string, patch: Partial<TaskPayload>): Promise<Task> {
    const { id } = await userId();
    const existing = await ownedTask(id, taskId);
    const scope = patch.edit_scope || 'entire';
    if (scope !== 'entire' && existing.task_type !== 'RECURRING') throw new Error('Only recurring tasks can be edited for one date or from a date onward');
    if ((scope === 'occurrence' || scope === 'future') && !patch.occurrence_date) throw new Error('Choose the date this edit applies to');
    if (scope === 'occurrence') {
      const fields: Record<string, unknown> = { updated_at: new Date().toISOString(), user_id: id };
      for (const field of ['title', 'description', 'priority', 'points'] as const) {
        if (patch[field] !== undefined && patch[field] !== null) fields[field] = patch[field];
      }
      const found = await supabaseBrowser().from('task_overrides').select('id').eq('task_id', taskId).eq('override_date', patch.occurrence_date).maybeSingle();
      fail(found.error);
      if (found.data?.id) fail((await supabaseBrowser().from('task_overrides').update(fields).eq('id', found.data.id)).error);
      else fail((await supabaseBrowser().from('task_overrides').insert({ ...fields, task_id: taskId, override_date: patch.occurrence_date, is_skipped: false, created_at: fields['updated_at'] })).error);
      return asTask(existing);
    }
    const merged = validateTask({
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description ?? '',
      priority: patch.priority ?? existing.priority,
      points: patch.points ?? existing.points,
      task_type: patch.task_type ?? existing.task_type,
      repeat_rule: patch.repeat_rule ?? (existing.repeat_rule as TaskPayload['repeat_rule']),
      custom_weekdays: patch.custom_weekdays ?? existing.custom_weekdays,
      start_date: patch.clear_end_date ? existing.start_date : patch.start_date ?? existing.start_date,
      end_date: patch.clear_end_date ? null : patch.end_date ?? existing.end_date,
      specific_date: patch.specific_date ?? existing.specific_date,
    });
    if (scope === 'future' && patch.occurrence_date && (!existing.start_date || patch.occurrence_date > existing.start_date)) {
      const previous = addDays(patch.occurrence_date, -1);
      fail((await supabaseBrowser().from('tasks').update({ end_date: previous, updated_at: new Date().toISOString() }).eq('id', taskId)).error);
      return this.createTask({ ...merged, start_date: patch.occurrence_date, is_active: patch.is_active ?? existing.is_active });
    }
    const now = new Date().toISOString();
    const { data, error } = await supabaseBrowser().from('tasks').update({
      title: merged.title.trim(),
      description: merged.description || '',
      priority: merged.priority,
      points: merged.points,
      task_type: merged.task_type,
      repeat_rule: merged.repeat_rule,
      custom_weekdays: merged.custom_weekdays,
      start_date: merged.start_date,
      end_date: merged.end_date,
      specific_date: merged.specific_date,
      is_active: patch.is_active ?? existing.is_active,
      updated_at: now,
    }).eq('id', taskId).select('*').single();
    fail(error);
    return asTask(normalizeTask(data as StoredTask));
  },

  async removeTask(taskId: string, scope = 'entire', occurrence?: string): Promise<void> {
    const { id } = await userId();
    const existing = await ownedTask(id, taskId);
    if (scope !== 'entire' && existing.task_type !== 'RECURRING') throw new Error('Only recurring tasks support partial delete');
    if ((scope === 'occurrence' || scope === 'future') && !occurrence) throw new Error('Choose the date this delete applies to');
    const now = new Date().toISOString();
    if (scope === 'occurrence') {
      const found = await supabaseBrowser().from('task_overrides').select('id').eq('task_id', taskId).eq('override_date', occurrence).maybeSingle();
      fail(found.error);
      if (found.data?.id) fail((await supabaseBrowser().from('task_overrides').update({ is_skipped: true, updated_at: now }).eq('id', found.data.id)).error);
      else fail((await supabaseBrowser().from('task_overrides').insert({ task_id: taskId, user_id: id, override_date: occurrence, is_skipped: true, created_at: now, updated_at: now })).error);
      return;
    }
    if (scope === 'future' && occurrence && (!existing.start_date || occurrence > existing.start_date)) {
      fail((await supabaseBrowser().from('tasks').update({ end_date: addDays(occurrence, -1), updated_at: now }).eq('id', taskId)).error);
      return;
    }
    fail((await supabaseBrowser().from('tasks').update({ deleted: true, is_active: false, updated_at: now }).eq('id', taskId)).error);
    fail((await supabaseBrowser().from('task_overrides').delete().eq('task_id', taskId).eq('user_id', id)).error);
  },

  async complete(taskId: string, day: string, today: string, completed: boolean): Promise<CompletionResult> {
    const { id } = await userId();
    const task = await ownedTask(id, taskId);
    const schedule = await loadSchedule(id);
    const override = schedule.overrideFor(task.id, day);
    const applies = schedule.resolve(day).some((item) => item.id === task.id) || false;
    if (!applies && !(override && !override.is_skipped)) {
      const scheduled = schedule.resolve(day).some((item) => item.id === task.id);
      if (!scheduled) throw new Error('This task is not scheduled on that date');
    }
    if (!schedule.resolve(day).some((item) => item.id === task.id)) throw new Error('This task is not scheduled on that date');
    const existing = schedule.completionFor(task.id, day);
    const now = new Date().toISOString();
    const earned = completed ? (existing?.completed ? Number(existing.earned_points || 0) : schedule.resolve(day).find((item) => item.id === task.id)?.points || task.points) : 0;
    const found = await supabaseBrowser().from('task_completions').select('id').eq('task_id', task.id).eq('completion_date', day).maybeSingle();
    fail(found.error);
    const completion = { user_id: id, completed, completed_at: completed ? now : null, earned_points: earned, updated_at: now };
    if (found.data?.id) fail((await supabaseBrowser().from('task_completions').update(completion).eq('id', found.data.id)).error);
    else fail((await supabaseBrowser().from('task_completions').insert({ ...completion, task_id: task.id, completion_date: day, created_at: now })).error);
    schedule.setCompletion(task.id, day, completed, earned, completed ? now : null);
    const summary = scoreFromTasks(schedule.resolve(day));
    await saveScore(id, day, summary);
    schedule.scores.set(day, { ...summary, score_date: day });
    const flags = buildFlags(schedule, today, new Set([day]));
    const completions = await rows<StoredCompletion>('task_completions', 'user_id', id);
    const completedCount = completions.filter((item) => item.completed).length;
    const totalXp = [...schedule.scores.values()].reduce((sum, score) => sum + Number(score.total_points || 0), 0);
    const codes = eligibleCodes({
      completedCount,
      totalXp,
      current: computeStreaks(flags, today).current,
      longest: computeStreaks(flags, today).longest,
      perfectDay: [...flags.values()].some((flag) => flag === true),
      perfectWeek: hasPerfectWeek(flags),
      comeback: isComeback(flags, today),
    });
    const catalog = (await supabaseBrowser().from('achievements').select('*')).data || ACHIEVEMENT_CATALOG;
    const owned = new Set((await rows<{ achievement_code: string }>('user_achievements', 'user_id', id)).map((item) => item.achievement_code));
    const unlocked: Achievement[] = [];
    for (const code of codes) {
      if (owned.has(code)) continue;
      const achievement = catalog.find((item: { code: string }) => item.code === code);
      if (!achievement) continue;
      const inserted = await supabaseBrowser().from('user_achievements').insert({
        user_id: id,
        achievement_id: 'id' in achievement ? achievement.id : null,
        achievement_code: code,
        unlocked_at: now,
      });
      if (inserted.error && !inserted.error.message.toLowerCase().includes('duplicate')) continue;
      owned.add(code);
      unlocked.push({ code, name: achievement.name, description: achievement.description, icon: achievement.icon, unlocked_at: now });
    }
    return { daily: await buildDaily(schedule, id, day, today), unlocked_achievements: unlocked };
  },

  async dashboard(day: string, hour: number): Promise<DashboardView> {
    const profile = await currentProfile();
    const schedule = await loadSchedule(profile.user.id);
    const summary = scoreFromTasks(schedule.resolve(day));
    await saveScore(profile.user.id, day, summary);
    schedule.scores.set(day, { ...summary, score_date: day });
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
    return {
      greeting: `${part}, ${profile.user.name}`,
      name: profile.user.name,
      date: day,
      date_label: formatLongDate(day),
      daily_goal: profile.settings.daily_goal,
      daily: await buildDaily(schedule, profile.user.id, day, day),
    };
  },

  async daily(day: string, today: string): Promise<DailyView> {
    const { id } = await userId();
    const schedule = await loadSchedule(id);
    if (day === today) {
      const summary = scoreFromTasks(schedule.resolve(day));
      await saveScore(id, day, summary);
      schedule.scores.set(day, { ...summary, score_date: day });
    }
    return buildDaily(schedule, id, day, today);
  },

  async stats(today: string): Promise<StatsView> {
    const { id } = await userId();
    const schedule = await loadSchedule(id);
    const todaySummary = scoreFromTasks(schedule.resolve(today));
    await saveScore(id, today, todaySummary);
    schedule.scores.set(today, { ...todaySummary, score_date: today });
    const flags = buildFlags(schedule, today, new Set([today]));
    const streaks = computeStreaks(flags, today);
    const daySummary = (day: string) => summaryFor(schedule, day, today, true);
    const weekStart = addDays(today, -(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))).getUTCDay() === 0 ? 6 : new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))).getUTCDay() - 1));
    const monthStart = `${today.slice(0, 7)}-01`;
    const span = (start: string, end: string) => {
      const days: string[] = [];
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) days.push(cursor);
      return days;
    };
    const weeklyXp = span(weekStart, today).reduce((sum, day) => sum + daySummary(day).total_points, 0);
    const monthlyXp = span(monthStart, today).reduce((sum, day) => sum + daySummary(day).total_points, 0);
    const xpByDay = [];
    const tasksByDay = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = addDays(today, -offset);
      const summary = daySummary(day);
      xpByDay.push({ date: day, xp: summary.total_points });
      tasksByDay.push({ date: day, completed: summary.completed_tasks });
    }
    const last30 = Array.from({ length: 30 }, (_, index) => daySummary(addDays(today, -(29 - index))));
    const active = last30.filter((item) => item.total_tasks > 0);
    const average = active.length ? Math.round((active.reduce((sum, item) => sum + item.total_points, 0) / active.length) * 10) / 10 : 0;
    let best: StatsView['best_day'] = null;
    for (const [day, score] of schedule.scores) {
      const xp = Number(score.total_points || 0);
      if (!best || xp > best.xp) best = { date: day, xp, date_label: formatLongDate(day) };
    }
    const weeklyCompletion = [];
    for (let weeksAgo = 7; weeksAgo >= 0; weeksAgo -= 1) {
      const anchor = addDays(today, -7 * weeksAgo);
      const start = addDays(anchor, -(new Date(parseDate(anchor)).getUTCDay() === 0 ? 6 : new Date(parseDate(anchor)).getUTCDay() - 1));
      const end = addDays(start, 6) < today ? addDays(start, 6) : today;
      const relevant = span(start, end).map(daySummary).filter((item) => item.total_tasks > 0);
      weeklyCompletion.push({ label: start, percentage: relevant.length ? Math.round(relevant.reduce((sum, item) => sum + item.completion_percentage, 0) / relevant.length) : 0 });
    }
    const monthlyCompletion = [];
    let year = Number(today.slice(0, 4));
    let month = Number(today.slice(5, 7));
    const months: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      months.push(`${year}-${String(month).padStart(2, '0')}-01`);
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    for (const start of months.reverse()) {
      if (start > today) continue;
      const last = addDays(addDays(start, 32).slice(0, 7) + '-01', -1);
      const end = last < today ? last : today;
      const relevant = span(start, end).map(daySummary).filter((item) => item.total_tasks > 0);
      monthlyCompletion.push({ label: monthLabel(start), percentage: relevant.length ? Math.round(relevant.reduce((sum, item) => sum + item.completion_percentage, 0) / relevant.length) : 0 });
    }
    const completions = await rows<StoredCompletion>('task_completions', 'user_id', id);
    return {
      daily_xp: todaySummary.total_points,
      weekly_xp: weeklyXp,
      monthly_xp: monthlyXp,
      completion_percentage: todaySummary.completion_percentage,
      average_daily_xp: average,
      current_streak: streaks.current,
      longest_streak: streaks.longest,
      weekly_streak: streaks.weekly,
      monthly_streak: streaks.monthly,
      total_completed_tasks: completions.filter((item) => item.completed).length,
      total_xp: [...schedule.scores.values()].reduce((sum, score) => sum + Number(score.total_points || 0), 0),
      best_day: best,
      xp_by_day: xpByDay,
      tasks_completed_by_day: tasksByDay,
      weekly_completion: weeklyCompletion,
      monthly_completion: monthlyCompletion,
    };
  },

  async history(today: string): Promise<{ items: HistoryItem[] }> {
    const { id } = await userId();
    const schedule = await loadSchedule(id);
    const flags = buildFlags(schedule, today);
    const items: HistoryItem[] = [];
    for (let offset = 0; offset < 60; offset += 1) {
      const day = addDays(today, -offset);
      const summary = summaryFor(schedule, day, today, true);
      if (summary.total_tasks === 0) continue;
      const past = new Map([...flags].filter(([key]) => key <= day));
      items.push({
        date: day,
        date_label: formatLongDate(day),
        completed_tasks: summary.completed_tasks,
        total_tasks: summary.total_tasks,
        completion_percentage: summary.completion_percentage,
        xp: summary.total_points,
        streak: computeStreaks(past, day).current,
        is_perfect_day: summary.is_perfect_day,
      });
    }
    return { items };
  },

  async calendar(year: number, month: number, today: string): Promise<CalendarMonth> {
    if (year < 2000 || year > 2100 || month < 1 || month > 12) throw new Error('Invalid calendar month');
    const { id } = await userId();
    const schedule = await loadSchedule(id);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = Number(addDays(addDays(start, 32).slice(0, 7) + '-01', -1).slice(8, 10));
    const days = [];
    for (let dayNumber = 1; dayNumber <= last; dayNumber += 1) {
      const day = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const summary = summaryFor(schedule, day, today, day <= today);
      days.push({
        date: day,
        total_tasks: summary.total_tasks,
        completed_tasks: summary.completed_tasks,
        completion_percentage: summary.completion_percentage,
        xp: summary.total_points,
        is_perfect_day: summary.is_perfect_day,
      });
    }
    return { year, month, days };
  },

  async achievements(): Promise<{ achievements: Achievement[] }> {
    const { id } = await userId();
    const unlocked = new Map((await rows<{ achievement_code: string; unlocked_at: string }>('user_achievements', 'user_id', id)).map((item) => [item.achievement_code, item.unlocked_at]));
    const catalog = ((await supabaseBrowser().from('achievements').select('*').order('code')).data || ACHIEVEMENT_CATALOG) as Achievement[];
    return {
      achievements: [...catalog].sort((left, right) => left.code.localeCompare(right.code)).map((item) => ({
        ...item,
        unlocked: unlocked.has(item.code),
        unlocked_at: unlocked.get(item.code) || null,
      })),
    };
  },

  profile: currentProfile,

  async updateProfile(payload: Partial<Profile['user']> & Partial<UserSettings> & { name?: string; email?: string }): Promise<Profile> {
    const account = await userId();
    const now = new Date().toISOString();
    if (payload.name) fail((await supabaseBrowser().from('profiles').update({ display_name: payload.name, updated_at: now }).eq('id', account.id)).error);
    if (payload.email && payload.email.toLowerCase() !== account.email.toLowerCase()) {
      fail((await supabaseBrowser().auth.updateUser({ email: payload.email.toLowerCase() })).error);
    }
    const settings: Record<string, unknown> = {};
    if (payload.daily_goal !== undefined) settings['daily_goal'] = payload.daily_goal;
    if (payload.theme) settings['theme'] = payload.theme;
    if (payload.notifications) settings['notifications'] = payload.notifications;
    if (payload.default_points) settings['default_points'] = payload.default_points;
    if (Object.keys(settings).length) {
      settings['updated_at'] = now;
      fail((await supabaseBrowser().from('user_settings').update(settings).eq('user_id', account.id)).error);
    }
    return currentProfile();
  },

  async changePassword(payload: { current_password: string; new_password: string }): Promise<{ detail: string }> {
    const account = await userId();
    if (payload.current_password === payload.new_password) throw new Error('Choose a different password');
    const check = await supabaseBrowser().auth.signInWithPassword({ email: account.email, password: payload.current_password });
    if (check.error) throw new Error('Current password is incorrect');
    fail((await supabaseBrowser().auth.updateUser({ password: payload.new_password })).error);
    return { detail: 'Password updated' };
  },
};

function parseDate(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}
