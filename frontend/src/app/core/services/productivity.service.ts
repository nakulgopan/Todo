import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  Achievement,
  CalendarMonth,
  CompletionResult,
  DailyView,
  DashboardView,
  HistoryItem,
  Profile,
  StatsView,
  ThemePreference,
  UserSettings,
} from '../models/models';
import { directApi } from '../supabase/client-api';
import { todayIso } from '../utils/dates';

@Injectable({ providedIn: 'root' })
export class ProductivityService {
  private readonly http = inject(HttpClient);

  dashboard(date = todayIso(), hour = new Date().getHours()): Observable<DashboardView> {
    if (environment.direct) return from(directApi.dashboard(date, hour));
    const params = new HttpParams().set('date', date).set('hour', hour);
    return this.http.get<DashboardView>(`${environment.apiUrl}/dashboard`, { params });
  }

  daily(date: string, today = todayIso()): Observable<DailyView> {
    if (environment.direct) return from(directApi.daily(date, today));
    const params = new HttpParams().set('today', today);
    return this.http.get<DailyView>(`${environment.apiUrl}/daily/${date}`, { params });
  }

  complete(taskId: string, date: string, today = todayIso()): Observable<CompletionResult> {
    if (environment.direct) return from(directApi.complete(taskId, date, today, true));
    const params = new HttpParams().set('today', today);
    return this.http.post<CompletionResult>(`${environment.apiUrl}/tasks/${taskId}/complete`, { date }, { params });
  }

  uncomplete(taskId: string, date: string, today = todayIso()): Observable<CompletionResult> {
    if (environment.direct) return from(directApi.complete(taskId, date, today, false));
    const params = new HttpParams().set('today', today);
    return this.http.post<CompletionResult>(`${environment.apiUrl}/tasks/${taskId}/uncomplete`, { date }, { params });
  }

  stats(today = todayIso()): Observable<StatsView> {
    if (environment.direct) return from(directApi.stats(today));
    return this.http.get<StatsView>(`${environment.apiUrl}/dashboard/stats`, {
      params: new HttpParams().set('today', today),
    });
  }

  history(today = todayIso()): Observable<{ items: HistoryItem[] }> {
    if (environment.direct) return from(directApi.history(today));
    return this.http.get<{ items: HistoryItem[] }>(`${environment.apiUrl}/dashboard/history`, {
      params: new HttpParams().set('today', today),
    });
  }

  calendar(year: number, month: number, today = todayIso()): Observable<CalendarMonth> {
    if (environment.direct) return from(directApi.calendar(year, month, today));
    return this.http.get<CalendarMonth>(`${environment.apiUrl}/calendar/${year}/${month}`, {
      params: new HttpParams().set('today', today),
    });
  }

  achievements(): Observable<{ achievements: Achievement[] }> {
    if (environment.direct) return from(directApi.achievements());
    return this.http.get<{ achievements: Achievement[] }>(`${environment.apiUrl}/achievements`);
  }

  profile(): Observable<Profile> {
    if (environment.direct) return from(directApi.profile());
    return this.http.get<Profile>(`${environment.apiUrl}/profile`);
  }

  updateProfile(payload: {
    name?: string;
    email?: string;
    daily_goal?: number;
    theme?: ThemePreference;
    notifications?: UserSettings['notifications'];
    default_points?: UserSettings['default_points'];
  }): Observable<Profile> {
    if (environment.direct) return from(directApi.updateProfile(payload));
    return this.http.put<Profile>(`${environment.apiUrl}/profile`, payload);
  }

  changePassword(payload: { current_password: string; new_password: string }): Observable<{ detail: string }> {
    if (environment.direct) return from(directApi.changePassword(payload));
    return this.http.put<{ detail: string }>(`${environment.apiUrl}/profile/password`, payload);
  }
}
