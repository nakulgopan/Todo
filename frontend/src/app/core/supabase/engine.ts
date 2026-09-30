import { DailyTask, Priority, TaskType } from '../models/models';

const PERFECT_DAY_BONUS = 50;
const LOOKBACK_DAYS = 366 * 3;
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const DEFAULT_POINTS: Record<string, number> = { LOW: 10, MEDIUM: 15, HIGH: 20, URGENT: 30 };

export interface StoredTask {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  points: number;
  task_type: TaskType;
  repeat_rule: string;
  custom_weekdays: number[];
  start_date: string | null;
  end_date: string | null;
  specific_date: string | null;
  is_active: boolean;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoredOverride {
  task_id: string;
  override_date: string;
  title: string | null;
  description: string | null;
  priority: string | null;
  points: number | null;
  is_skipped: boolean;
}

export interface StoredCompletion {
  task_id: string;
  completion_date: string;
  completed: boolean;
  earned_points: number;
  completed_at: string | null;
}

export interface StoredScore {
  score_date: string;
  task_points: number;
  bonus_points: number;
  total_points: number;
  completed_tasks: number;
  total_tasks: number;
  completion_percentage: number;
  is_perfect_day: boolean;
}

export interface ScoreSummary {
  task_points: number;
  bonus_points: number;
  total_points: number;
  completed_tasks: number;
  total_tasks: number;
  completion_percentage: number;
  is_perfect_day: boolean;
}

export function parseIso(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = parseIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoOf(date);
}

export function weekdayNumber(value: string): number {
  const day = parseIso(value).getUTCDay();
  return day === 0 ? 7 : day;
}

export function formatLongDate(value: string): string {
  const date = parseIso(value);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(date);
  return `${weekday}, ${date.getUTCDate()} ${month}`;
}

export function monthLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parseIso(value));
}

function taskApplies(task: StoredTask, day: string, override: StoredOverride | undefined): boolean {
  if (task.deleted) return false;
  if (override?.is_skipped) return false;
  if (!task.is_active) return false;
  if (task.task_type === 'ONE_TIME') return task.specific_date === day;
  if (task.task_type !== 'RECURRING') return false;
  if (task.start_date && day < task.start_date) return false;
  if (task.end_date && day > task.end_date) return false;
  if (task.repeat_rule === 'DAILY') return true;
  if (task.repeat_rule === 'WEEKDAYS') return weekdayNumber(day) <= 5;
  if (task.repeat_rule === 'CUSTOM_WEEKDAYS') return (task.custom_weekdays || []).includes(weekdayNumber(day));
  return false;
}

function effectivePoints(task: StoredTask, override: StoredOverride | undefined): number {
  if (override && override.points !== null && override.points !== undefined) return Number(override.points);
  return Number(task.points || DEFAULT_POINTS['MEDIUM']);
}

function overrideValue<T>(taskValue: T, override: StoredOverride | undefined, field: keyof StoredOverride): T {
  if (override && override[field] !== null && override[field] !== undefined) return override[field] as T;
  return taskValue;
}

export class Schedule {
  private readonly overrides = new Map<string, StoredOverride>();
  private readonly completions = new Map<string, StoredCompletion>();
  readonly scores = new Map<string, StoredScore>();

  constructor(
    readonly tasks: StoredTask[],
    overrides: StoredOverride[],
    completions: StoredCompletion[],
    scores: StoredScore[],
  ) {
    for (const item of overrides) this.overrides.set(`${item.task_id}|${item.override_date}`, item);
    for (const item of completions) this.completions.set(`${item.task_id}|${item.completion_date}`, item);
    for (const item of scores) this.scores.set(item.score_date, item);
  }

  overrideFor(taskId: string, day: string): StoredOverride | undefined {
    return this.overrides.get(`${taskId}|${day}`);
  }

  completionFor(taskId: string, day: string): StoredCompletion | undefined {
    return this.completions.get(`${taskId}|${day}`);
  }

  setCompletion(taskId: string, day: string, completed: boolean, earned: number, completedAt: string | null): void {
    this.completions.set(`${taskId}|${day}`, {
      task_id: taskId,
      completion_date: day,
      completed,
      earned_points: earned,
      completed_at: completedAt,
    });
  }

  resolve(day: string): DailyTask[] {
    const items: DailyTask[] = [];
    for (const task of this.tasks) {
      const override = this.overrideFor(task.id, day);
      const completion = this.completionFor(task.id, day);
      const completed = Boolean(completion?.completed);
      const applies = taskApplies(task, day, override);
      const historical = !applies && completed && (task.deleted || !task.is_active);
      if (!applies && !historical) continue;
      items.push({
        id: task.id,
        title: overrideValue(task.title, override, 'title'),
        description: overrideValue(task.description || '', override, 'description') || '',
        priority: overrideValue(task.priority, override, 'priority') as Priority,
        points: effectivePoints(task, override),
        earned_points: completed ? Number(completion?.earned_points || 0) : 0,
        task_type: task.task_type,
        repeat_rule: task.repeat_rule as DailyTask['repeat_rule'],
        custom_weekdays: [...(task.custom_weekdays || [])],
        completed,
        is_custom: task.task_type === 'ONE_TIME',
      });
    }
    items.sort((left, right) => (PRIORITY_RANK[left.priority] ?? 9) - (PRIORITY_RANK[right.priority] ?? 9) || left.title.localeCompare(right.title));
    return items;
  }
}

export function scoreFromTasks(tasks: DailyTask[]): ScoreSummary {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const taskPoints = tasks.filter((task) => task.completed).reduce((sum, task) => sum + Number(task.earned_points), 0);
  const percentage = total ? Math.round((100 * completed) / total) : 0;
  const perfect = total > 0 && completed === total;
  const bonus = perfect ? PERFECT_DAY_BONUS : 0;
  return {
    task_points: taskPoints,
    bonus_points: bonus,
    total_points: taskPoints + bonus,
    completed_tasks: completed,
    total_tasks: total,
    completion_percentage: percentage,
    is_perfect_day: perfect,
  };
}

function snapshotSummary(score: StoredScore): ScoreSummary {
  return {
    task_points: Number(score.task_points || 0),
    bonus_points: Number(score.bonus_points || 0),
    total_points: Number(score.total_points || 0),
    completed_tasks: Number(score.completed_tasks || 0),
    total_tasks: Number(score.total_tasks || 0),
    completion_percentage: Number(score.completion_percentage || 0),
    is_perfect_day: Boolean(score.is_perfect_day),
  };
}

export function summaryFor(schedule: Schedule, day: string, today: string, preferSnapshot: boolean): ScoreSummary {
  if (preferSnapshot && day < today) {
    const snapshot = schedule.scores.get(day);
    if (snapshot) return snapshotSummary(snapshot);
  }
  return scoreFromTasks(schedule.resolve(day));
}

function windowStart(schedule: Schedule, today: string): string {
  let earliest = today;
  const floor = addDays(today, -LOOKBACK_DAYS);
  for (const task of schedule.tasks) {
    for (const key of [task.start_date, task.specific_date]) {
      if (key && key < earliest) earliest = key;
    }
  }
  for (const day of schedule.scores.keys()) {
    if (day < earliest) earliest = day;
  }
  return earliest < floor ? floor : earliest;
}

export function buildFlags(schedule: Schedule, today: string, liveDates = new Set<string>()): Map<string, boolean | null> {
  const flags = new Map<string, boolean | null>();
  let cursor = windowStart(schedule, today);
  while (cursor <= today) {
    if (cursor === today || liveDates.has(cursor)) {
      const tasks = schedule.resolve(cursor);
      flags.set(cursor, tasks.length ? tasks.every((task) => task.completed) : null);
    } else {
      const snapshot = schedule.scores.get(cursor);
      if (snapshot) flags.set(cursor, Number(snapshot.total_tasks || 0) === 0 ? null : Boolean(snapshot.is_perfect_day));
      else {
        const tasks = schedule.resolve(cursor);
        flags.set(cursor, tasks.length ? tasks.every((task) => task.completed) : null);
      }
    }
    cursor = addDays(cursor, 1);
  }
  return flags;
}

function periodState(days: string[], flags: Map<string, boolean | null>, today: string): 'success' | 'fail' | 'empty' {
  let sawSuccess = false;
  for (const day of days) {
    if (day > today) break;
    const flag = flags.get(day);
    if (flag === true) sawSuccess = true;
    else if (flag === false && day !== today) return 'fail';
  }
  return sawSuccess ? 'success' : 'empty';
}

function weekDays(anchor: string): string[] {
  const monday = addDays(anchor, -(weekdayNumber(anchor) - 1));
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));
}

function monthDays(anchor: string): string[] {
  const start = `${anchor.slice(0, 7)}-01`;
  const date = parseIso(start);
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const days: string[] = [];
  const cursor = new Date(date);
  while (cursor < next) {
    days.push(isoOf(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function consecutive(flags: Map<string, boolean | null>, today: string, kind: 'week' | 'month'): number {
  if (!flags.size) return 0;
  const earliest = [...flags.keys()].sort()[0];
  let anchor = today;
  let count = 0;
  for (let index = 0; index < 520; index += 1) {
    const days = kind === 'week' ? weekDays(anchor) : monthDays(anchor);
    if (days[0] < addDays(earliest, -31)) break;
    const state = periodState(days, flags, today);
    if (state === 'success') count += 1;
    else if (state === 'fail') break;
    anchor = kind === 'week' ? addDays(days[0], -7) : addDays(`${days[0].slice(0, 7)}-01`, -1).slice(0, 7) + '-01';
  }
  return count;
}

export function computeStreaks(flags: Map<string, boolean | null>, today: string) {
  if (!flags.size) return { current: 0, longest: 0, weekly: 0, monthly: 0 };
  const dates = [...flags.keys()].sort();
  const start = dates[0];
  const end = dates[dates.length - 1] > today ? dates[dates.length - 1] : today;
  let longest = 0;
  let run = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const flag = flags.get(cursor);
    if (flag === true) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (flag === false) run = 0;
  }
  let current = 0;
  for (let cursor = flags.get(today) === true ? today : addDays(today, -1); cursor >= addDays(start, -1); cursor = addDays(cursor, -1)) {
    const flag = flags.get(cursor);
    if (flag === true) current += 1;
    else if (flag === false) break;
  }
  return { current, longest, weekly: consecutive(flags, today, 'week'), monthly: consecutive(flags, today, 'month') };
}

export function hasPerfectWeek(flags: Map<string, boolean | null>): boolean {
  if (!flags.size) return false;
  const dates = [...flags.keys()].sort();
  let monday = addDays(dates[0], -(weekdayNumber(dates[0]) - 1));
  const last = dates[dates.length - 1];
  while (monday <= last) {
    if (weekDays(monday).every((day) => flags.get(day) === true)) return true;
    monday = addDays(monday, 7);
  }
  return false;
}

export function isComeback(flags: Map<string, boolean | null>, today: string): boolean {
  if (flags.get(today) !== true || !flags.size) return false;
  const start = [...flags.keys()].sort()[0];
  for (let cursor = addDays(today, -1); cursor >= start; cursor = addDays(cursor, -1)) {
    const flag = flags.get(cursor);
    if (flag === true) return false;
    if (flag === false) return true;
  }
  return false;
}

const POOLS: Record<string, string[]> = {
  week: [
    '🔥 One full week completed. Your consistency is becoming a habit.',
    'Seven strong days. You are proving this sticks. 🔥',
    'A full week of follow-through. That is how momentum feels. 🚀',
  ],
  perfect: ['🏆 PERFECT DAY! Nothing left on today\'s list.', '🏆 PERFECT DAY! You cleared the board.', 'Outstanding! You crushed today\'s plan! 🔥'],
  outstanding: ['Outstanding! You crushed today\'s plan! 🔥', 'This is a strong day. Keep the last few within reach. 🚀', 'You are close to a perfect day. Finish proud. ⭐'],
  great: ['Great work! You\'re staying consistent. 🚀', 'Solid follow-through today. The habit is showing. 🔥', 'You showed up and moved the day forward. 🚀'],
  good: ['Good progress! You\'re building the habit. 🔥', 'You are stacking small wins. Stay with it. 💪', 'Nice momentum. A little more and today feels lighter. ✨'],
  small: ['Small steps still count. Tomorrow let\'s do a little more. 💪', 'You started. That already beats a blank day. 💪', 'One task down is still progress. Keep the chain alive. 🌱'],
  improved: ['Better than yesterday. That is real progress. 📈', 'You improved on yesterday. Keep climbing. 🚀', 'Today is ahead of yesterday. Nice correction. 🔥'],
  start: ['The list is waiting. One task starts the day. 💪', 'Nothing completed yet. Pick the smallest task and begin. 🌱', 'A fresh day. Start with one checkbox. ✨'],
  rest: ['No tasks scheduled. Rest is part of the plan. 🌿', 'Open day. Add something that matters, or enjoy the space. ☀️', 'Nothing on the books today. Your streak is safe. 🔥'],
};

async function pick(pool: string[], userId: string, day: string, bucket: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${day}:${bucket}`));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return pool[Number.parseInt(hex.slice(0, 8), 16) % pool.length];
}

export async function motivation(input: {
  userId: string;
  day: string;
  completionPercentage: number;
  totalPoints: number;
  completedTasks: number;
  totalTasks: number;
  isPerfectDay: boolean;
  currentStreak: number;
  previous: number | null;
}): Promise<string> {
  const improved = input.previous !== null && input.completionPercentage > input.previous && !input.isPerfectDay && input.completedTasks > 0;
  let bucket = 'start';
  if (input.totalTasks === 0) bucket = 'rest';
  else if (input.isPerfectDay && input.currentStreak >= 7 && input.currentStreak % 7 === 0) bucket = 'week';
  else if (input.isPerfectDay) bucket = 'perfect';
  else if (improved) bucket = 'improved';
  else if (input.completionPercentage >= 80 || input.totalPoints >= 100) bucket = 'outstanding';
  else if (input.completionPercentage >= 60 || input.currentStreak >= 3) bucket = 'great';
  else if (input.completionPercentage >= 30) bucket = 'good';
  else if (input.completedTasks > 0) bucket = 'small';
  return pick(POOLS[bucket], input.userId, input.day, bucket);
}

export const ACHIEVEMENT_CATALOG = [
  { code: 'FIRST_TASK', name: 'First Step', description: 'Complete your first task', icon: 'flag', requirement: 'Complete 1 task' },
  { code: 'FIRST_PERFECT_DAY', name: 'Perfect Day', description: 'Complete every task scheduled for a day', icon: 'emoji_events', requirement: 'Finish a perfect day' },
  { code: 'THREE_DAY_STREAK', name: 'Hat Trick', description: 'Reach a 3-day streak', icon: 'local_fire_department', requirement: 'Reach a 3-day streak' },
  { code: 'SEVEN_DAY_STREAK', name: 'Full Week', description: 'Reach a 7-day streak', icon: 'local_fire_department', requirement: 'Reach a 7-day streak' },
  { code: 'THIRTY_DAY_STREAK', name: 'Iron Month', description: 'Reach a 30-day streak', icon: 'military_tech', requirement: 'Reach a 30-day streak' },
  { code: 'ONE_HUNDRED_TASKS', name: 'Centurion', description: 'Complete 100 tasks', icon: 'task_alt', requirement: 'Complete 100 tasks' },
  { code: 'FIVE_HUNDRED_XP', name: 'Rising', description: 'Earn 500 XP', icon: 'star', requirement: 'Earn 500 XP' },
  { code: 'ONE_THOUSAND_XP', name: 'Thousand Club', description: 'Earn 1,000 XP', icon: 'stars', requirement: 'Earn 1,000 XP' },
  { code: 'PERFECT_WEEK', name: 'Perfect Week', description: 'Complete every scheduled task across a Monday–Sunday week', icon: 'workspace_premium', requirement: 'Complete a perfect Monday–Sunday week' },
  { code: 'COMEBACK', name: 'Comeback', description: 'Finish a perfect day after a missed day', icon: 'replay', requirement: 'Finish a perfect day after a missed day' },
];

export function eligibleCodes(input: {
  completedCount: number;
  totalXp: number;
  current: number;
  longest: number;
  perfectDay: boolean;
  perfectWeek: boolean;
  comeback: boolean;
}): string[] {
  const best = Math.max(input.current, input.longest);
  const codes: string[] = [];
  if (input.completedCount >= 1) codes.push('FIRST_TASK');
  if (input.perfectDay) codes.push('FIRST_PERFECT_DAY');
  if (best >= 3) codes.push('THREE_DAY_STREAK');
  if (best >= 7) codes.push('SEVEN_DAY_STREAK');
  if (best >= 30) codes.push('THIRTY_DAY_STREAK');
  if (input.completedCount >= 100) codes.push('ONE_HUNDRED_TASKS');
  if (input.totalXp >= 500) codes.push('FIVE_HUNDRED_XP');
  if (input.totalXp >= 1000) codes.push('ONE_THOUSAND_XP');
  if (input.perfectWeek) codes.push('PERFECT_WEEK');
  if (input.comeback) codes.push('COMEBACK');
  return codes;
}
