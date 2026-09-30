import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { CalendarDay } from '../../core/models/models';
import { ProductivityService } from '../../core/services/productivity.service';
import { formatLongDate, shiftMonth, todayIso } from '../../core/utils/dates';
import { DayDialog } from '../../shared/dialogs/day-dialog';

@Component({
  selector: 'app-calendar',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <header class="page-head">
      <div>
        <h1>Calendar</h1>
        <p>{{ monthLabel() }}</p>
      </div>
      <div class="month-nav">
        <button mat-stroked-button type="button" (click)="move(-1)">Previous</button>
        <button mat-stroked-button type="button" (click)="goToday()">Today</button>
        <button mat-stroked-button type="button" (click)="move(1)">Next</button>
      </div>
    </header>
    <div class="calendar-grid">
      @for (name of weekdayNames; track name) {
        <div class="weekday">{{ name }}</div>
      }
      @for (blank of blanks(); track blank) {
        <div class="day-cell empty"></div>
      }
      @for (day of days(); track day.date) {
        <button type="button" class="day-cell" [class.perfect]="day.is_perfect_day" [class.today]="day.date === today" (click)="open(day)">
          <strong>{{ dayNumber(day.date) }}</strong>
          @if (day.total_tasks) {
            <span class="day-count">{{ day.completed_tasks }}/{{ day.total_tasks }}</span>
            <span>{{ day.completion_percentage }}%</span>
            <span>{{ day.xp }} XP</span>
          }
          @if (day.is_perfect_day) {
            <em>Perfect</em>
          }
        </button>
      }
    </div>
  `,
})
export class Calendar {
  private readonly api = inject(ProductivityService);
  private readonly dialog = inject(MatDialog);
  readonly weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly today = todayIso();
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly days = signal<CalendarDay[]>([]);
  readonly blanks = signal<number[]>([]);

  constructor() {
    this.load();
  }

  monthLabel(): string {
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
      new Date(this.year(), this.month() - 1, 1),
    );
  }

  dayNumber(value: string): number {
    return Number(value.slice(-2));
  }

  move(delta: number): void {
    const next = shiftMonth(this.year(), this.month(), delta);
    this.year.set(next.year);
    this.month.set(next.month);
    this.load();
  }

  goToday(): void {
    const now = new Date();
    this.year.set(now.getFullYear());
    this.month.set(now.getMonth() + 1);
    this.load();
  }

  open(day: CalendarDay): void {
    this.dialog
      .open(DayDialog, { width: '560px', maxWidth: '95vw', data: day.date })
      .afterClosed()
      .subscribe(() => this.load());
  }

  load(): void {
    const first = new Date(this.year(), this.month() - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    this.blanks.set(Array.from({ length: offset }, (_, index) => index));
    this.api.calendar(this.year(), this.month()).subscribe((month) => this.days.set(month.days));
  }

  label(day: CalendarDay): string {
    return formatLongDate(day.date);
  }
}
