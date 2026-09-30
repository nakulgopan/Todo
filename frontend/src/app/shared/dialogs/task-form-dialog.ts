import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import {
  DefaultPoints,
  EditScope,
  PRIORITY_POINTS,
  Priority,
  RepeatRule,
  Task,
  TaskPayload,
  TaskType,
  WEEKDAYS,
} from '../../core/models/models';
import { parseIso, toIso } from '../../core/utils/dates';

export interface TaskFormData {
  mode: 'create' | 'edit';
  scope?: EditScope;
  occurrenceDate?: string;
  task?: Task;
  lockType?: TaskType;
  lockDate?: string;
  defaultPoints?: DefaultPoints;
}

@Component({
  selector: 'app-task-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <mat-dialog-content>
      @if (data.scope && data.scope !== 'entire') {
        <p class="scope-note">{{ scopeNote }}</p>
      }
      <form [formGroup]="form" class="form-grid" id="task-form">
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Title</mat-label>
          <input matInput formControlName="title" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Description</mat-label>
          <textarea matInput rows="2" formControlName="description"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Priority</mat-label>
          <mat-select formControlName="priority" (selectionChange)="onPriority($event.value)">
            @for (priority of priorities; track priority) {
              <mat-option [value]="priority">{{ priority }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Points</mat-label>
          <input matInput type="number" formControlName="points" (input)="pointsEdited = true" />
        </mat-form-field>
        @if (data.scope !== 'occurrence') {
          <mat-form-field appearance="outline">
            <mat-label>Type</mat-label>
            <mat-select formControlName="task_type">
              <mat-option value="ONE_TIME">One-time</mat-option>
              <mat-option value="RECURRING">Recurring</mat-option>
            </mat-select>
          </mat-form-field>
          @if (form.controls.task_type.value === 'ONE_TIME') {
            <mat-form-field appearance="outline">
              <mat-label>Date</mat-label>
              <input matInput [matDatepicker]="specificPicker" formControlName="specific_date" />
              <mat-datepicker-toggle matIconSuffix [for]="specificPicker"></mat-datepicker-toggle>
              <mat-datepicker #specificPicker></mat-datepicker>
            </mat-form-field>
          } @else {
            <mat-form-field appearance="outline">
              <mat-label>Repeats</mat-label>
              <mat-select formControlName="repeat_rule">
                <mat-option value="DAILY">Daily</mat-option>
                <mat-option value="WEEKDAYS">Weekdays</mat-option>
                <mat-option value="CUSTOM_WEEKDAYS">Custom weekdays</mat-option>
              </mat-select>
            </mat-form-field>
            @if (form.controls.repeat_rule.value === 'CUSTOM_WEEKDAYS') {
              <div class="span-2">
                <div class="field-label">Weekdays</div>
                <mat-button-toggle-group [multiple]="true" [value]="form.controls.custom_weekdays.value" (change)="setWeekdays($event.value)">
                  @for (day of weekdays; track day.value) {
                    <mat-button-toggle [value]="day.value">{{ day.label }}</mat-button-toggle>
                  }
                </mat-button-toggle-group>
              </div>
            }
            <mat-form-field appearance="outline">
              <mat-label>Starts</mat-label>
              <input matInput [matDatepicker]="startPicker" formControlName="start_date" />
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Ends</mat-label>
              <input matInput [matDatepicker]="endPicker" formControlName="end_date" />
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
          }
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" type="button" class="save-task" (click)="save()">Save task</button>
    </mat-dialog-actions>
  `,
  styles: `
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
    .span-2 { grid-column: span 2; }
    .scope-note, .field-label { color: var(--muted); }
    .field-label { margin-bottom: 8px; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
    @media (max-width: 640px) {
      .form-grid, .span-2 { grid-template-columns: 1fr; display: block; }
    }
  `,
})
export class TaskFormDialog {
  readonly data = inject<TaskFormData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TaskFormDialog, TaskPayload>);
  readonly priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  readonly weekdays = WEEKDAYS;
  pointsEdited = false;
  private readonly defaults = this.data.defaultPoints ?? PRIORITY_POINTS;

  readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
    priority: ['MEDIUM' as Priority],
    points: [this.defaults.MEDIUM, [Validators.required, Validators.min(1), Validators.max(500)]],
    task_type: [(this.data.lockType ?? 'RECURRING') as TaskType],
    repeat_rule: ['DAILY' as RepeatRule],
    custom_weekdays: [[] as number[]],
    start_date: [new Date() as Date | null],
    end_date: [null as Date | null],
    specific_date: [(this.data.lockDate ? parseIso(this.data.lockDate) : null) as Date | null],
  });

  constructor() {
    const task = this.data.task;
    if (task) {
      this.form.patchValue({
        title: task.title,
        description: task.description,
        priority: task.priority,
        points: task.points,
        task_type: task.task_type,
        repeat_rule: task.repeat_rule === 'NONE' ? 'DAILY' : task.repeat_rule,
        custom_weekdays: [...task.custom_weekdays],
        start_date: task.start_date ? parseIso(task.start_date) : new Date(),
        end_date: task.end_date ? parseIso(task.end_date) : null,
        specific_date: task.specific_date ? parseIso(task.specific_date) : null,
      });
      this.pointsEdited = true;
    }
    if (this.data.lockType) {
      this.form.controls.task_type.setValue(this.data.lockType);
      this.form.controls.task_type.disable();
    }
    if (this.data.scope === 'future' && this.data.occurrenceDate) {
      this.form.controls.start_date.setValue(parseIso(this.data.occurrenceDate));
    }
  }

  get title(): string {
    if (this.data.mode === 'create') {
      return this.data.lockDate ? 'Custom task' : 'New task';
    }
    if (this.data.scope === 'occurrence') {
      return 'Edit this occurrence';
    }
    if (this.data.scope === 'future') {
      return 'Edit from this date';
    }
    return 'Edit task';
  }

  get scopeNote(): string {
    return this.data.scope === 'occurrence'
      ? 'Only this date changes. Earlier completions keep their XP.'
      : 'A new series starts on the selected date. Earlier records stay unchanged.';
  }

  onPriority(priority: Priority): void {
    if (!this.pointsEdited) {
      this.form.controls.points.setValue(this.defaults[priority]);
    }
  }

  setWeekdays(values: number[]): void {
    this.form.controls.custom_weekdays.setValue(values ?? []);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const recurring = raw.task_type === 'RECURRING' && this.data.scope !== 'occurrence';
    const payload: TaskPayload = {
      title: raw.title.trim(),
      description: raw.description.trim(),
      priority: raw.priority,
      points: Number(raw.points),
      task_type: raw.task_type,
      repeat_rule: recurring ? raw.repeat_rule : 'NONE',
      custom_weekdays: recurring && raw.repeat_rule === 'CUSTOM_WEEKDAYS' ? raw.custom_weekdays : [],
      start_date: recurring && raw.start_date ? toIso(raw.start_date) : null,
      end_date: recurring && raw.end_date ? toIso(raw.end_date) : null,
      specific_date: raw.task_type === 'ONE_TIME' && raw.specific_date ? toIso(raw.specific_date) : null,
      edit_scope: this.data.scope ?? 'entire',
      occurrence_date: this.data.occurrenceDate ?? null,
      clear_end_date: recurring && !raw.end_date && Boolean(this.data.task?.end_date),
    };
    if (raw.task_type === 'ONE_TIME' && !payload.specific_date) {
      this.form.controls.specific_date.setErrors({ required: true });
      this.form.controls.specific_date.markAsTouched();
      return;
    }
    if (recurring && raw.repeat_rule === 'CUSTOM_WEEKDAYS' && raw.custom_weekdays.length === 0) {
      return;
    }
    this.dialogRef.close(payload);
  }
}
