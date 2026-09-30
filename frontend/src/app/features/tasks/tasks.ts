import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime } from 'rxjs';

import { EditScope, Task } from '../../core/models/models';
import { TaskService } from '../../core/services/task.service';
import { errorMessage, todayIso } from '../../core/utils/dates';
import { ConfirmDialog } from '../../shared/dialogs/confirm-dialog';
import { EditScopeDialog, ScopeDialogResult } from '../../shared/dialogs/edit-scope-dialog';
import { TaskFormDialog } from '../../shared/dialogs/task-form-dialog';

@Component({
  selector: 'app-tasks',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  template: `
    <header class="page-head">
      <div>
        <h1>All tasks</h1>
        <p>Search, sort, and shape the habits that repeat.</p>
      </div>
      <button mat-flat-button color="primary" type="button" class="add-task" (click)="create()">Add task</button>
    </header>
    <div class="toolbar">
      <mat-form-field appearance="outline">
        <mat-label>Search</mat-label>
        <input matInput [formControl]="search" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Filter</mat-label>
        <mat-select [value]="filter()" (selectionChange)="filter.set($event.value); load()">
          <mat-option value="all">All</mat-option>
          <mat-option value="active">Active</mat-option>
          <mat-option value="recurring">Recurring</mat-option>
          <mat-option value="one_time">One-time</mat-option>
          <mat-option value="high_priority">High priority</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Sort</mat-label>
        <mat-select [value]="sort()" (selectionChange)="sort.set($event.value); load()">
          <mat-option value="priority">Priority</mat-option>
          <mat-option value="created">Created date</mat-option>
          <mat-option value="points">Points</mat-option>
          <mat-option value="title">Title</mat-option>
        </mat-select>
      </mat-form-field>
    </div>
    @if (loading()) {
      <div class="skeleton-list"><span></span><span></span><span></span></div>
    } @else if (tasks().length === 0) {
      <div class="empty-state">
        <h3>No tasks match</h3>
        <p>Try another filter or add something worth doing.</p>
      </div>
    } @else {
      <div class="task-table">
        @for (task of tasks(); track task.id) {
          <article class="task-card">
            <div>
              <strong>{{ task.title }}</strong>
              <p>{{ task.description || scheduleLabel(task) }}</p>
            </div>
            <span [class]="'priority ' + task.priority">{{ task.priority }}</span>
            <span>{{ task.points }} XP</span>
            <span>{{ task.is_active ? 'Active' : 'Paused' }}</span>
            <div class="row-actions">
              <button mat-button type="button" (click)="edit(task)">Edit</button>
              <button mat-button type="button" (click)="toggleActive(task)">{{ task.is_active ? 'Disable' : 'Enable' }}</button>
              <button mat-button color="warn" type="button" (click)="remove(task)">Delete</button>
            </div>
          </article>
        }
      </div>
    }
  `,
})
export class Tasks {
  private readonly api = inject(TaskService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly loading = signal(true);
  readonly tasks = signal<Task[]>([]);
  readonly filter = signal('all');
  readonly sort = signal('priority');
  readonly search = new FormControl('', { nonNullable: true });

  constructor() {
    this.search.valueChanges.pipe(debounceTime(200)).subscribe(() => this.load());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list(this.filter(), this.search.value, this.sort()).subscribe({
      next: (response) => {
        this.tasks.set(response.tasks);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.snack.open(errorMessage(error), 'Close', { duration: 3500 });
      },
    });
  }

  scheduleLabel(task: Task): string {
    if (task.task_type === 'ONE_TIME') {
      return `One-time · ${task.specific_date}`;
    }
    if (task.repeat_rule === 'WEEKDAYS') {
      return 'Weekdays';
    }
    if (task.repeat_rule === 'CUSTOM_WEEKDAYS') {
      return 'Custom weekdays';
    }
    return 'Daily';
  }

  create(): void {
    this.dialog
      .open(TaskFormDialog, { width: '560px', maxWidth: '95vw', data: { mode: 'create' } })
      .afterClosed()
      .subscribe((payload) => {
        if (!payload) {
          return;
        }
        this.api.create(payload).subscribe({
          next: () => {
            this.snack.open('Task added', 'Close', { duration: 2500 });
            this.load();
          },
          error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
        });
      });
  }

  edit(task: Task): void {
    if (task.task_type === 'RECURRING') {
      this.dialog
        .open(EditScopeDialog, {
          width: '440px',
          data: { title: `Edit “${task.title}”`, action: 'Edit', date: todayIso() },
        })
        .afterClosed()
        .subscribe((result: ScopeDialogResult | undefined) => {
          if (!result) {
            return;
          }
          this.openEditor(task, result.scope, result.date);
        });
      return;
    }
    this.openEditor(task, 'entire');
  }

  toggleActive(task: Task): void {
    this.api.update(task.id, { is_active: !task.is_active, edit_scope: 'entire' }).subscribe({
      next: () => this.load(),
      error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
    });
  }

  remove(task: Task): void {
    if (task.task_type === 'RECURRING') {
      this.dialog
        .open(EditScopeDialog, {
          width: '440px',
          data: { title: `Delete “${task.title}”`, action: 'Delete', date: todayIso() },
        })
        .afterClosed()
        .subscribe((result: ScopeDialogResult | undefined) => {
          if (!result) {
            return;
          }
          this.api.remove(task.id, result.scope, result.date).subscribe({
            next: () => this.load(),
            error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
          });
        });
      return;
    }
    this.dialog
      .open(ConfirmDialog, {
        data: { title: 'Delete task', message: `Delete “${task.title}”? Past scores stay in history.`, confirmText: 'Delete' },
      })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (!confirmed) {
          return;
        }
        this.api.remove(task.id).subscribe({
          next: () => this.load(),
          error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
        });
      });
  }

  private openEditor(task: Task, scope: EditScope, occurrenceDate?: string): void {
    this.dialog
      .open(TaskFormDialog, {
        width: '560px',
        maxWidth: '95vw',
        data: { mode: 'edit', task, scope, occurrenceDate },
      })
      .afterClosed()
      .subscribe((payload) => {
        if (!payload) {
          return;
        }
        this.api.update(task.id, payload).subscribe({
          next: () => {
            this.snack.open('Task updated', 'Close', { duration: 2500 });
            this.load();
          },
          error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
        });
      });
  }
}
