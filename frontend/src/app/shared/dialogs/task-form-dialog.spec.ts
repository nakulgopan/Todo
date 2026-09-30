import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';

import { Task } from '../../core/models/models';
import { parseIso } from '../../core/utils/dates';
import { TaskFormDialog } from './task-form-dialog';

const existing: Task = {
  id: '1',
  title: 'Gym',
  description: 'Workout',
  priority: 'HIGH',
  points: 20,
  task_type: 'RECURRING',
  repeat_rule: 'DAILY',
  custom_weekdays: [],
  start_date: '2026-09-30',
  end_date: null,
  specific_date: null,
  is_active: true,
  created_at: '',
  updated_at: '',
};

function setup(data: unknown) {
  const dialogRef = { close: jasmine.createSpy('close') };
  TestBed.configureTestingModule({
    imports: [TaskFormDialog],
    providers: [
      provideNativeDateAdapter(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
    ],
  });
  const fixture = TestBed.createComponent(TaskFormDialog);
  fixture.detectChanges();
  return { fixture, dialogRef };
}

describe('Task form', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('adds a one-time task for a specific date', () => {
    const { fixture, dialogRef } = setup({ mode: 'create', lockType: 'ONE_TIME', lockDate: '2026-10-02' });
    fixture.componentInstance.form.patchValue({
      title: 'Buy notebook',
      points: 10,
      specific_date: parseIso('2026-10-02'),
    });
    fixture.componentInstance.save();
    expect(dialogRef.close).toHaveBeenCalled();
    const payload = dialogRef.close.calls.mostRecent().args[0];
    expect(payload.task_type).toBe('ONE_TIME');
    expect(payload.title).toBe('Buy notebook');
    expect(payload.specific_date).toBe('2026-10-02');
    expect(payload.points).toBe(10);
  });

  it('edits an existing task', () => {
    const { fixture, dialogRef } = setup({ mode: 'edit', task: existing, scope: 'entire' });
    expect(fixture.componentInstance.form.controls.title.value).toBe('Gym');
    fixture.componentInstance.form.controls.title.setValue('Morning gym');
    fixture.componentInstance.save();
    const payload = dialogRef.close.calls.mostRecent().args[0];
    expect(payload.title).toBe('Morning gym');
    expect(payload.edit_scope).toBe('entire');
    expect(payload.points).toBe(20);
  });

  it('builds a custom weekday recurring task', () => {
    const { fixture, dialogRef } = setup({ mode: 'create' });
    fixture.componentInstance.form.patchValue({
      title: 'Lift',
      task_type: 'RECURRING',
      repeat_rule: 'CUSTOM_WEEKDAYS',
      custom_weekdays: [1, 3],
      start_date: parseIso('2026-09-30'),
    });
    fixture.componentInstance.save();
    const payload = dialogRef.close.calls.mostRecent().args[0];
    expect(payload.task_type).toBe('RECURRING');
    expect(payload.repeat_rule).toBe('CUSTOM_WEEKDAYS');
    expect(payload.custom_weekdays).toEqual([1, 3]);
    expect(payload.start_date).toBe('2026-09-30');
  });
});
