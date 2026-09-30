import { HttpErrorResponse } from '@angular/common/http';

export function todayIso(now = new Date()): string {
  return toIso(now);
}

export function toIso(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

export function parseIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function formatLongDate(value: string): string {
  const date = parseIso(value);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(date);
  return `${weekday}, ${date.getDate()} ${month}`;
}

export function greeting(name: string, now = new Date()): string {
  const hour = now.getHours();
  const part =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
  return `${part}, ${name}`;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.map((item: { msg?: string }) => item.msg ?? 'Invalid value').join(' ');
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
