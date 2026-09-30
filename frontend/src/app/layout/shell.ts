import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../core/services/auth.service';
import { ProductivityService } from '../core/services/productivity.service';
import { ThemeService } from '../core/services/theme.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
  template: `
    <div class="shell">
      <aside class="sidebar" [class.open]="menuOpen()">
        <a class="logo" routerLink="/">
          <span class="logo-mark">✶</span>
          <span>Northstar</span>
        </a>
        <nav>
          @for (item of links; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.exact }">
              <mat-icon>{{ item.icon }}</mat-icon>
              {{ item.label }}
            </a>
          }
        </nav>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <button mat-icon-button type="button" class="menu-button" (click)="menuOpen.set(!menuOpen())" aria-label="Open menu">
            <mat-icon>menu</mat-icon>
          </button>
          <span class="top-name">{{ auth.currentUser()?.name }}</span>
          <button mat-button type="button" (click)="auth.logout()">Log out</button>
        </header>
        <main class="content" (click)="menuOpen.set(false)">
          <router-outlet />
        </main>
        <nav class="bottom-nav">
          @for (item of primary; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.exact }">
              <mat-icon>{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
      </div>
    </div>
  `,
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly productivity = inject(ProductivityService);
  private readonly theme = inject(ThemeService);
  readonly menuOpen = signal(false);
  readonly links = [
    { path: '/', label: 'Today', icon: 'wb_sunny', exact: true },
    { path: '/tasks', label: 'Tasks', icon: 'checklist', exact: false },
    { path: '/calendar', label: 'Calendar', icon: 'calendar_month', exact: false },
    { path: '/history', label: 'History', icon: 'history', exact: false },
    { path: '/statistics', label: 'Statistics', icon: 'insights', exact: false },
    { path: '/achievements', label: 'Achievements', icon: 'emoji_events', exact: false },
    { path: '/profile', label: 'Profile', icon: 'person', exact: false },
  ];
  readonly primary = this.links.slice(0, 5);

  constructor() {
    if (!this.auth.currentUser()) {
      this.auth.loadCurrentUser().subscribe({ error: () => this.auth.clearSession() });
    }
    this.productivity.profile().subscribe({
      next: (profile) => {
        this.auth.currentUser.set(profile.user);
        this.theme.apply(profile.settings.theme);
      },
    });
  }
}
