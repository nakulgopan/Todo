import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ProductivityService } from '../../core/services/productivity.service';
import { TaskService } from '../../core/services/task.service';
import { DailyView } from '../../core/models/models';
import { Dashboard } from './dashboard';

const daily: DailyView = {
  date: '2026-09-30',
  tasks: [
    {
      id: 'gym',
      title: 'Gym',
      description: '',
      priority: 'MEDIUM',
      points: 15,
      earned_points: 15,
      task_type: 'RECURRING',
      repeat_rule: 'DAILY',
      custom_weekdays: [],
      completed: true,
      is_custom: false,
    },
    {
      id: 'read',
      title: 'Read 20 pages',
      description: '',
      priority: 'MEDIUM',
      points: 15,
      earned_points: 0,
      task_type: 'RECURRING',
      repeat_rule: 'DAILY',
      custom_weekdays: [],
      completed: false,
      is_custom: false,
    },
  ],
  custom_tasks: [
    {
      id: 'notebook',
      title: 'Buy notebook',
      description: '',
      priority: 'LOW',
      points: 10,
      earned_points: 0,
      task_type: 'ONE_TIME',
      repeat_rule: 'NONE',
      custom_weekdays: [],
      completed: false,
      is_custom: true,
    },
  ],
  task_points: 15,
  bonus_points: 0,
  total_points: 130,
  completed_tasks: 8,
  total_tasks: 8,
  completion_percentage: 90,
  is_perfect_day: false,
  streak: { current: 7, longest: 7, weekly: 1, monthly: 1 },
  motivation: 'Great work! You are staying consistent.',
  previous_completion_percentage: 70,
};

describe('Dashboard', () => {
  const productivity = jasmine.createSpyObj('ProductivityService', ['dashboard', 'complete', 'uncomplete']);

  beforeEach(async () => {
    productivity.dashboard.and.returnValue(
      of({ greeting: 'Good evening, Nakul', name: 'Nakul', date: '2026-09-30', date_label: 'Wednesday, 30 September', daily_goal: 100, daily }),
    );
    productivity.complete.and.returnValue(of({ daily: { ...daily, tasks: daily.tasks.map((task) => ({ ...task, completed: true })) }, unlocked_achievements: [] }));
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        { provide: ProductivityService, useValue: productivity },
        { provide: TaskService, useValue: jasmine.createSpyObj('TaskService', ['create']) },
        { provide: AuthService, useValue: { currentUser: signal({ name: 'Nakul', id: '1', email: 'nakul@example.com', created_at: '', updated_at: '' }) } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(undefined) }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
      ],
    }).compileComponents();
  });

  it('shows progress, streak, tasks, and the motivational note', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Nakul');
    expect(text).toContain('90%');
    expect(text).toContain('130 XP');
    expect(text).toContain('7 DAY STREAK');
    expect(text).toContain('Gym');
    expect(text).toContain('Buy notebook');
    expect(text).toContain('Great work');
  });

  it('completes a task through the productivity service', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    fixture.componentInstance.toggle(daily.tasks[1], true);
    expect(productivity.complete).toHaveBeenCalledWith('read', fixture.componentInstance.date);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Read 20 pages');
  });
});
