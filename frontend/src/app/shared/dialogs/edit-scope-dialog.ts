import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { EditScope } from '../../core/models/models';
import { parseIso, toIso } from '../../core/utils/dates';

export interface ScopeDialogData {
  title: string;
  action: string;
  date?: string;
}

export interface ScopeDialogResult {
  scope: EditScope;
  date: string;
}

@Component({
  selector: 'app-edit-scope-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="hint">Past completions and scores stay as they were.</p>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Date</mat-label>
        <input matInput [matDatepicker]="picker" [formControl]="form.controls.date" />
        <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
        <mat-datepicker #picker></mat-datepicker>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="stack">
      <button mat-stroked-button type="button" (click)="choose('occurrence')">{{ data.action }} this occurrence only</button>
      <button mat-stroked-button type="button" (click)="choose('future')">{{ data.action }} from this date onward</button>
      <button mat-flat-button color="primary" type="button" (click)="choose('entire')">{{ data.action }} entire recurring task</button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint { margin-top: 0; color: var(--muted); }
    .full { width: 100%; }
    .stack { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
  `,
})
export class EditScopeDialog {
  readonly data = inject<ScopeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EditScopeDialog, ScopeDialogResult>);
  readonly form = inject(FormBuilder).nonNullable.group({
    date: [this.data.date ? parseIso(this.data.date) : new Date(), Validators.required],
  });

  choose(scope: EditScope): void {
    const value = this.form.controls.date.value;
    if (!value) {
      return;
    }
    this.dialogRef.close({ scope, date: toIso(value) });
  }
}
