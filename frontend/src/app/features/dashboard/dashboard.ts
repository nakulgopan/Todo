import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DailyTask, DailyView } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';
import { ProductivityService } from '../../core/services/productivity.service';
import { TaskService } from '../../core/services/task.service';
import { errorMessage, formatLongDate, greeting, todayIso } from '../../core/utils/dates';
import { TaskFormDialog } from '../../shared/dialogs/task-form-dialog';

@Component({
  selector: 'app-dashboard',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
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
        <button mat-flat-button color="primary" type="button" (click)="addTask()">Add task</button>
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

      <section class="panel">
        <h2>Today</h2>
        @if (view.tasks.length === 0 && view.custom_tasks.length === 0) {
          <div class="empty-state">
            <h3>Nothing scheduled</h3>
            <p>Add a recurring habit or a one-time task for today.</p>
          </div>
        }
        @for (task of view.tasks; track task.id) {
          <div class="task-row">
            <button
              type="button"
              class="done-toggle"
              [class.is-done]="task.completed"
              [attr.aria-pressed]="task.completed"
              [attr.aria-label]="(task.completed ? 'Mark not done: ' : 'Mark done: ') + task.title"
              (click)="toggle(task, !task.completed)">
              {{ task.completed ? '✓' : '' }}
            </button>
            <span>
              <strong>{{ task.title }}</strong>
              <small [class]="'priority ' + task.priority">{{ task.priority }}</small>
            </span>
            <em>+{{ task.completed ? task.earned_points : task.points }}</em>
          </div>
        }
        @if (view.custom_tasks.length) {
          <h3 class="section-label">Custom for today</h3>
          @for (task of view.custom_tasks; track task.id) {
            <div class="task-row">
              <button
                type="button"
                class="done-toggle"
                [class.is-done]="task.completed"
                [attr.aria-pressed]="task.completed"
                [attr.aria-label]="(task.completed ? 'Mark not done: ' : 'Mark done: ') + task.title"
                (click)="toggle(task, !task.completed)">
                {{ task.completed ? '✓' : '' }}
              </button>
              <span><strong>{{ task.title }}</strong></span>
              <em>+{{ task.completed ? task.earned_points : task.points }}</em>
            </div>
          }
        }
      </section>

      <section class="motivation">{{ view.motivation }}</section>
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
  readonly date = todayIso();

  constructor() {
    this.load();
  }

  greetingText(): string {
    return greeting(this.auth.currentUser()?.name ?? 'there');
  }

  dateLabel(): string {
    return formatLongDate(this.date);
  }

  load(): void {
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
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.snack.open(errorMessage(error), 'Close', { duration: 3500 });
      },
    });
  }

  toggle(task: DailyTask, checked: boolean): void {
    const request = checked
      ? this.productivity.complete(task.id, this.date)
      : this.productivity.uncomplete(task.id, this.date);
    request.subscribe({
      next: (result) => {
        this.daily.set(result.daily);
        for (const achievement of result.unlocked_achievements) {
          this.snack.open(`Achievement unlocked: ${achievement.name}`, 'Close', { duration: 4000 });
        }
      },
      error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
    });
  }

  addTask(): void {
    this.dialog
      .open(TaskFormDialog, { width: '560px', maxWidth: '95vw', data: { mode: 'create' } })
      .afterClosed()
      .subscribe((payload) => {
        if (!payload) {
          return;
        }
        this.tasksApi.create(payload).subscribe({
          next: () => {
            this.snack.open('Task added', 'Close', { duration: 2500 });
            this.load();
          },
          error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
        });
      });
  }
}
