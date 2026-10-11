import { Component, inject, signal } from '@angular/core';
import { concat } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DailyTask, DailyView } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';
import { ProductivityService } from '../../core/services/productivity.service';
import { TaskService } from '../../core/services/task.service';
import { addDays, errorMessage, formatLongDate, formatShortDate, greeting, todayIso } from '../../core/utils/dates';
import { TaskFormDialog } from '../../shared/dialogs/task-form-dialog';

@Component({
  selector: 'app-dashboard',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, MatSlideToggleModule],
  template: `
    @if (loading()) {
      <section class="skeleton-page">
        <div class="skeleton-hero"></div>
        <div class="skeleton-list"><span></span><span></span><span></span><span></span></div>
      </section>
    } @else if (daily(); as view) {
      <header class="page-head">
        <div>
          <h1>{{ greetingText() }} 👋</h1>
          <p>{{ dateLabel() }}</p>
        </div>
        <button mat-flat-button color="primary" type="button" (click)="addTask()">Add daily task</button>
      </header>

      <section class="progress-card">
        <div class="progress-copy">
          <span>Today's progress</span>
          <strong class="progress-label">{{ view.completion_percentage }}%</strong>
        </div>
        <mat-progress-bar mode="determinate" [value]="view.completion_percentage"></mat-progress-bar>
        <div class="stat-row">
          <div><span class="stat-kicker">XP</span><strong>⭐ {{ view.total_points }} XP</strong></div>
          <div><span class="stat-kicker">Streak</span><strong class="streak-label">🔥 {{ view.streak.current }} DAY STREAK</strong></div>
          <div><span class="stat-kicker">Tasks</span><strong>{{ view.completed_tasks }} / {{ view.total_tasks }} TASKS COMPLETED</strong></div>
        </div>
        @if (view.is_perfect_day) {
          <p class="bonus">Perfect Day Bonus +{{ view.bonus_points }} XP</p>
        }
      </section>

      <section class="day-list">
        @for (day of dates(); track day) {
          <article class="day-card" [class.is-today]="day === date" [class.is-open]="openDate() === day">
            <button type="button" class="day-head" (click)="open(day)" [attr.aria-expanded]="openDate() === day">
              <strong>{{ shortDate(day) }}</strong>
              @if (day === date) {
                <span class="today-pill">Today</span>
              }
              <span class="day-chevron">{{ openDate() === day ? '▾' : '▸' }}</span>
            </button>
            @if (openDate() === day) {
              <div class="day-body">
                @if (viewFor(day); as dayView) {
                  <div class="day-actions">
                    <button mat-stroked-button type="button" (click)="addForDate(day)">Add task for {{ shortDate(day) }}</button>
                    <button mat-flat-button color="primary" type="button" [disabled]="!dirty(day) || saving()" (click)="save(day)">Save</button>
                  </div>
                  @if (dayView.tasks.length === 0 && dayView.custom_tasks.length === 0) {
                    <div class="empty-state">
                      <h3>Nothing scheduled</h3>
                      <p>No tasks on this date.</p>
                    </div>
                  }
                  @for (task of dayView.tasks; track task.id) {
                    <div class="task-row">
                      <span>
                        <strong>{{ task.title }}</strong>
                        <small [class]="'priority ' + task.priority">{{ task.priority }}</small>
                      </span>
                      <div class="done-slide">
                        <span [class.is-current]="!isDone(task, day)">Undone</span>
                        <mat-slide-toggle color="primary" [checked]="isDone(task, day)" (change)="mark(task, day, $event.checked)" [attr.aria-label]="'Done or undone: ' + task.title"></mat-slide-toggle>
                        <span [class.is-current]="isDone(task, day)">Done</span>
                      </div>
                      <em>+{{ isDone(task, day) ? task.earned_points || task.points : task.points }}</em>
                    </div>
                  }
                  @for (task of dayView.custom_tasks; track task.id) {
                    <div class="task-row">
                      <span>
                        <strong>{{ task.title }}</strong>
                      </span>
                      <div class="done-slide">
                        <span [class.is-current]="!isDone(task, day)">Undone</span>
                        <mat-slide-toggle color="primary" [checked]="isDone(task, day)" (change)="mark(task, day, $event.checked)" [attr.aria-label]="'Done or undone: ' + task.title"></mat-slide-toggle>
                        <span [class.is-current]="isDone(task, day)">Done</span>
                      </div>
                      <em>+{{ isDone(task, day) ? task.earned_points || task.points : task.points }}</em>
                    </div>
                  }
                  <p class="day-note">{{ dayView.motivation }}</p>
                } @else {
                  <div class="skeleton-list"><span></span><span></span></div>
                }
              </div>
            }
          </article>
        }
        <button mat-stroked-button type="button" (click)="showEarlier()">Earlier dates</button>
      </section>
    }
  `,
})
export class Dashboard {
  private readonly productivity = inject(ProductivityService);
  private readonly auth = inject(AuthService);
  private readonly tasksApi = inject(TaskService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly loading = signal(true);
  readonly daily = signal<DailyView | null>(null);
  readonly pastViews = signal<Record<string, DailyView>>({});
  readonly openDate = signal(todayIso());
  readonly span = signal(21);
  readonly saving = signal(false);
  readonly date = todayIso();
  private readonly drafts = signal<Record<string, Record<string, boolean>>>({});

  constructor() {
    this.load();
  }

  greetingText(): string {
    return greeting(this.auth.currentUser()?.name ?? 'there');
  }

  dateLabel(): string {
    return formatLongDate(this.date);
  }

  shortDate(day: string): string {
    return formatShortDate(day);
  }

  dates(): string[] {
    return Array.from({ length: this.span() + 1 }, (_, index) => addDays(this.date, -index));
  }

  viewFor(day: string): DailyView | null {
    if (day === this.date) {
      return this.daily();
    }
    return this.pastViews()[day] ?? null;
  }

  open(day: string): void {
    if (day > this.date) {
      return;
    }
    if (this.openDate() === day) {
      this.openDate.set('');
      return;
    }
    this.openDate.set(day);
    if (day !== this.date && !this.pastViews()[day]) {
      this.productivity.daily(day).subscribe({
        next: (view) => this.pastViews.update((current) => ({ ...current, [day]: view })),
        error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
      });
    }
  }

  showEarlier(): void {
    this.span.update((count) => count + 14);
  }

  isDone(task: DailyTask, day: string): boolean {
    const draft = this.drafts()[day]?.[task.id];
    return draft === undefined ? task.completed : draft;
  }

  mark(task: DailyTask, day: string, completed: boolean): void {
    this.drafts.update((current) => ({
      ...current,
      [day]: { ...current[day], [task.id]: completed },
    }));
  }

  dirty(day: string): boolean {
    const view = this.viewFor(day);
    if (!view) {
      return false;
    }
    return [...view.tasks, ...view.custom_tasks].some((task) => this.isDone(task, day) !== task.completed);
  }

  save(day: string): void {
    const view = this.viewFor(day);
    if (!view || this.saving()) {
      return;
    }
    const changes = [...view.tasks, ...view.custom_tasks].filter((task) => this.isDone(task, day) !== task.completed);
    if (!changes.length) {
      return;
    }
    this.saving.set(true);
    const unlocked: string[] = [];
    concat(
      ...changes.map((task) =>
        this.isDone(task, day) ? this.productivity.complete(task.id, day) : this.productivity.uncomplete(task.id, day),
      ),
    ).subscribe({
      next: (result) => {
        for (const achievement of result.unlocked_achievements) {
          unlocked.push(achievement.name);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.snack.open(errorMessage(error), 'Close', { duration: 3500 });
      },
      complete: () => {
        this.saving.set(false);
        for (const name of unlocked) {
          this.snack.open(`Achievement unlocked: ${name}`, 'Close', { duration: 4000 });
        }
        this.snack.open('Saved', 'Close', { duration: 2500 });
        this.refresh(day);
        if (day !== this.date) {
          this.load();
        }
      },
    });
  }

  addTask(): void {
    this.createTask({ mode: 'create', lockType: 'RECURRING', lockRepeat: 'DAILY' }, this.date);
  }

  addForDate(day: string): void {
    this.createTask({ mode: 'create', lockType: 'ONE_TIME', lockDate: day }, day);
  }

  private createTask(data: { mode: 'create'; lockType: 'RECURRING' | 'ONE_TIME'; lockRepeat?: 'DAILY'; lockDate?: string }, day: string): void {
    this.dialog
      .open(TaskFormDialog, { width: '560px', maxWidth: '95vw', data })
      .afterClosed()
      .subscribe((payload) => {
        if (!payload) {
          return;
        }
        this.tasksApi.create(payload).subscribe({
          next: () => {
            this.snack.open('Task added', 'Close', { duration: 2500 });
            this.refresh(day);
            if (day !== this.date) {
              this.load();
            }
          },
          error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
        });
      });
  }

  private refresh(day: string): void {
    const clear = () => {
      this.drafts.update((current) => {
        const next = { ...current };
        delete next[day];
        return next;
      });
    };
    if (day === this.date) {
      this.load(clear);
      return;
    }
    this.productivity.daily(day).subscribe({
      next: (view) => {
        this.pastViews.update((current) => ({ ...current, [day]: view }));
        clear();
      },
      error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
    });
  }

  private load(after?: () => void): void {
    this.productivity.dashboard(this.date).subscribe({
      next: (view) => {
        this.daily.set(view.daily);
        if (!this.auth.currentUser() && view.name) {
          this.auth.currentUser.set({
            id: '',
            name: view.name,
            email: '',
            created_at: '',
            updated_at: '',
          });
        }
        this.loading.set(false);
        after?.();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.snack.open(errorMessage(error), 'Close', { duration: 3500 });
      },
    });
  }
}
