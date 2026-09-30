export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskType = 'ONE_TIME' | 'RECURRING';
export type RepeatRule = 'NONE' | 'DAILY' | 'WEEKDAYS' | 'CUSTOM_WEEKDAYS';
export type EditScope = 'entire' | 'occurrence' | 'future';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface DefaultPoints {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  URGENT: number;
}

export interface NotificationSettings {
  reminders: boolean;
  achievements: boolean;
  email: boolean;
}

export interface UserSettings {
  daily_goal: number;
  default_points: DefaultPoints;
  theme: ThemePreference;
  notifications: NotificationSettings;
}

export interface Profile {
  user: User;
  settings: UserSettings;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  points: number;
  task_type: TaskType;
  repeat_rule: RepeatRule;
  custom_weekdays: number[];
  start_date: string | null;
  end_date: string | null;
  specific_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskPayload {
  title: string;
  description: string;
  priority: Priority;
  points: number;
  task_type: TaskType;
  repeat_rule: RepeatRule;
  custom_weekdays: number[];
  start_date: string | null;
  end_date: string | null;
  specific_date: string | null;
  is_active?: boolean;
  edit_scope?: EditScope;
  occurrence_date?: string | null;
  clear_end_date?: boolean;
}

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  points: number;
  earned_points: number;
  task_type: TaskType;
  repeat_rule: RepeatRule;
  custom_weekdays: number[];
  completed: boolean;
  is_custom: boolean;
}

export interface StreakInfo {
  current: number;
  longest: number;
  weekly: number;
  monthly: number;
}

export interface DailyView {
  date: string;
  tasks: DailyTask[];
  custom_tasks: DailyTask[];
  task_points: number;
  bonus_points: number;
  total_points: number;
  completed_tasks: number;
  total_tasks: number;
  completion_percentage: number;
  is_perfect_day: boolean;
  streak: StreakInfo;
  motivation: string;
  previous_completion_percentage: number | null;
}

export interface CompletionResult {
  daily: DailyView;
  unlocked_achievements: Achievement[];
}

export interface DashboardView {
  greeting: string;
  name: string;
  date: string;
  date_label: string;
  daily_goal: number;
  daily: DailyView;
}

export interface CalendarDay {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  completion_percentage: number;
  xp: number;
  is_perfect_day: boolean;
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[];
}

export interface HistoryItem {
  date: string;
  date_label: string;
  completed_tasks: number;
  total_tasks: number;
  completion_percentage: number;
  xp: number;
  streak: number;
  is_perfect_day: boolean;
}

export interface ChartPoint {
  date?: string;
  label?: string;
  xp?: number;
  completed?: number;
  percentage?: number;
}

export interface StatsView {
  daily_xp: number;
  weekly_xp: number;
  monthly_xp: number;
  completion_percentage: number;
  average_daily_xp: number;
  current_streak: number;
  longest_streak: number;
  weekly_streak: number;
  monthly_streak: number;
  total_completed_tasks: number;
  total_xp: number;
  best_day: { date: string; xp: number; date_label: string } | null;
  xp_by_day: { date: string; xp: number }[];
  tasks_completed_by_day: { date: string; completed: number }[];
  weekly_completion: { label: string; percentage: number }[];
  monthly_completion: { label: string; percentage: number }[];
}

export interface Achievement {
  code: string;
  name: string;
  description: string;
  icon: string;
  unlocked?: boolean;
  unlocked_at?: string | null;
}

export const PRIORITY_POINTS: DefaultPoints = {
  LOW: 10,
  MEDIUM: 15,
  HIGH: 20,
  URGENT: 30,
};

export const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];
