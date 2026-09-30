import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/models';

const TOKEN_KEY = 'northstar_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly supabase: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly currentUser = signal<User | null>(null);

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        this.remember(session.access_token);
      }
    });
  }

  restore(): Promise<void> {
    return this.supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.access_token) {
          this.remember(data.session.access_token);
        }
      })
      .catch(() => undefined);
  }

  register(payload: { name: string; email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, payload).pipe(
      tap((response) => {
        this.remember(response.access_token);
        this.currentUser.set(response.user);
      }),
    );
  }

  login(payload: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, payload).pipe(
      tap((response) => {
        this.remember(response.access_token);
        this.currentUser.set(response.user);
      }),
    );
  }

  loadCurrentUser(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(tap((user) => this.currentUser.set(user)));
  }

  logout(): void {
    void this.supabase.auth.signOut().finally(() => {
      this.clearSession();
      void this.router.navigate(['/login']);
    });
  }

  clearSession(): void {
    this.remember(null);
    this.currentUser.set(null);
  }

  isLoggedIn(): boolean {
    return Boolean(this.token());
  }

  private remember(token: string | null): void {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    this.token.set(token);
  }
}
