import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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
import { todayIso } from '../utils/dates';

@Injectable({ providedIn: 'root' })
export class ProductivityService {
  private readonly http = inject(HttpClient);

  dashboard(date = todayIso(), hour = new Date().getHours()): Observable<DashboardView> {
    const params = new HttpParams().set('date', date).set('hour', hour);
    return this.http.get<DashboardView>(`${environment.apiUrl}/dashboard`, { params });
  }

  daily(date: string, today = todayIso()): Observable<DailyView> {
    const params = new HttpParams().set('today', today);
    return this.http.get<DailyView>(`${environment.apiUrl}/daily/${date}`, { params });
  }

  complete(taskId: string, date: string, today = todayIso()): Observable<CompletionResult> {
    const params = new HttpParams().set('today', today);
    return this.http.post<CompletionResult>(`${environment.apiUrl}/tasks/${taskId}/complete`, { date }, { params });
  }

  uncomplete(taskId: string, date: string, today = todayIso()): Observable<CompletionResult> {
    const params = new HttpParams().set('today', today);
    return this.http.post<CompletionResult>(`${environment.apiUrl}/tasks/${taskId}/uncomplete`, { date }, { params });
  }

  stats(today = todayIso()): Observable<StatsView> {
    return this.http.get<StatsView>(`${environment.apiUrl}/dashboard/stats`, {
      params: new HttpParams().set('today', today),
    });
  }

  history(today = todayIso()): Observable<{ items: HistoryItem[] }> {
    return this.http.get<{ items: HistoryItem[] }>(`${environment.apiUrl}/dashboard/history`, {
      params: new HttpParams().set('today', today),
    });
  }

  calendar(year: number, month: number, today = todayIso()): Observable<CalendarMonth> {
    return this.http.get<CalendarMonth>(`${environment.apiUrl}/calendar/${year}/${month}`, {
      params: new HttpParams().set('today', today),
    });
  }

  achievements(): Observable<{ achievements: Achievement[] }> {
    return this.http.get<{ achievements: Achievement[] }>(`${environment.apiUrl}/achievements`);
  }

  profile(): Observable<Profile> {
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
    return this.http.put<Profile>(`${environment.apiUrl}/profile`, payload);
  }

  changePassword(payload: { current_password: string; new_password: string }): Observable<{ detail: string }> {
    return this.http.put<{ detail: string }>(`${environment.apiUrl}/profile/password`, payload);
  }
}
