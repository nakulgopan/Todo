import { Component, inject, signal } from '@angular/core';
import { concat } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DailyTask, DailyView, TaskPayload } from '../../core/models/models';
import { ProductivityService } from '../../core/services/productivity.service';
import { TaskService } from '../../core/services/task.service';
import { errorMessage, formatLongDate } from '../../core/utils/dates';
import { TaskFormDialog } from './task-form-dialog';

@Component({
  selector: 'app-day-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressBarModule, MatSlideToggleModule],
  template: `
    <h2 mat-dialog-title>{{ label }}</h2>
    <mat-dialog-content>
      @if (loading()) {
        <div class="skeleton-list"><span></span><span></span><span></span></div>
      } @else if (daily(); as view) {
        <div class="day-summary">
          <span>{{ view.completed_tasks }} / {{ view.total_tasks }} tasks</span>
          <strong>{{ view.total_points }} XP</strong>
        </div>
        <mat-progress-bar mode="determinate" [value]="view.completion_percentage"></mat-progress-bar>
        @if (view.tasks.length === 0 && view.custom_tasks.length === 0) {
          <p class="empty">Nothing scheduled for this date.</p>
        }
        @for (task of view.tasks; track task.id) {
          <div class="task-line">
            <span>{{ task.title }}</span>
            <div class="done-slide">
              <span [class.is-current]="!isDone(task)">Undone</span>
              <mat-slide-toggle color="primary" [checked]="isDone(task)" (change)="mark(task, $event.checked)" [attr.aria-label]="'Done or undone: ' + task.title"></mat-slide-toggle>
              <span [class.is-current]="isDone(task)">Done</span>
            </div>
            <em>+{{ isDone(task) ? task.earned_points || task.points : task.points }}</em>
          </div>
        }
        @if (view.custom_tasks.length) {
          <h3>Custom for this date</h3>
          @for (task of view.custom_tasks; track task.id) {
            <div class="task-line">
              <span>{{ task.title }}</span>
              <div class="done-slide">
                <span [class.is-current]="!isDone(task)">Undone</span>
                <mat-slide-toggle color="primary" [checked]="isDone(task)" (change)="mark(task, $event.checked)" [attr.aria-label]="'Done or undone: ' + task.title"></mat-slide-toggle>
                <span [class.is-current]="isDone(task)">Done</span>
              </div>
              <em>+{{ isDone(task) ? task.earned_points || task.points : task.points }}</em>
            </div>
          }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Close</button>
      <button mat-stroked-button type="button" (click)="addCustom()">Add custom task</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!dirty() || saving()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .day-summary { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .task-line { display: flex; gap: 12px; align-items: center; padding: 8px 0; }
    .task-line > span { flex: 1; }
    .empty { color: var(--muted); }
    h3 { margin: 16px 0 4px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  `,
})
export class DayDialog {
  readonly date = inject<string>(MAT_DIALOG_DATA);
  private readonly productivity = inject(ProductivityService);
  private readonly tasks = inject(TaskService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly loading = signal(true);
  readonly daily = signal<DailyView | null>(null);
  readonly saving = signal(false);
  readonly label = formatLongDate(this.date);
  private readonly drafts = signal<Record<string, boolean>>({});

  constructor() {
    this.load();
  }

  load(quiet = false): void {
    if (!quiet) {
      this.loading.set(true);
    }
    this.productivity.daily(this.date).subscribe({
      next: (view) => {
        this.daily.set(view);
        this.drafts.set({});
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.snack.open(errorMessage(error), 'Close', { duration: 3500 });
      },
    });
  }

  isDone(task: DailyTask): boolean {
    const draft = this.drafts()[task.id];
    return draft === undefined ? task.completed : draft;
  }

  mark(task: DailyTask, completed: boolean): void {
    this.drafts.update((current) => ({ ...current, [task.id]: completed }));
  }

  dirty(): boolean {
    const view = this.daily();
    if (!view) {
      return false;
    }
    return [...view.tasks, ...view.custom_tasks].some((task) => this.isDone(task) !== task.completed);
  }

  save(): void {
    const view = this.daily();
    if (!view || this.saving()) {
      return;
    }
    const changes = [...view.tasks, ...view.custom_tasks].filter((task) => this.isDone(task) !== task.completed);
    if (!changes.length) {
      return;
    }
    this.saving.set(true);
    concat(
      ...changes.map((task) =>
        this.isDone(task) ? this.productivity.complete(task.id, this.date) : this.productivity.uncomplete(task.id, this.date),
      ),
    ).subscribe({
      complete: () => {
        this.saving.set(false);
        this.snack.open('Saved', 'Close', { duration: 2500 });
        this.load(true);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.snack.open(errorMessage(error), 'Close', { duration: 3500 });
      },
    });
  }

  addCustom(): void {
    const ref = this.dialog.open(TaskFormDialog, {
      width: '560px',
      maxWidth: '95vw',
      data: { mode: 'create', lockType: 'ONE_TIME', lockDate: this.date },
    });
    ref.afterClosed().subscribe((payload: TaskPayload | undefined) => {
      if (!payload) {
        return;
      }
      this.tasks.create(payload).subscribe({
        next: () => this.load(),
        error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
      });
    });
  }
}
