import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ProductivityService } from '../../core/services/productivity.service';
import { Calendar } from './calendar';

describe('Calendar', () => {
  beforeEach(async () => {
    const productivity = jasmine.createSpyObj('ProductivityService', ['calendar']);
    productivity.calendar.and.returnValue(
      of({
        year: 2026,
        month: 10,
        days: [
          { date: '2026-10-01', total_tasks: 2, completed_tasks: 2, completion_percentage: 100, xp: 80, is_perfect_day: true },
          { date: '2026-10-02', total_tasks: 1, completed_tasks: 0, completion_percentage: 0, xp: 0, is_perfect_day: false },
        ],
      }),
    );
    await TestBed.configureTestingModule({
      imports: [Calendar],
      providers: [
        { provide: ProductivityService, useValue: productivity },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(undefined) }) } },
      ],
    }).compileComponents();
  });

  it('shows task counts, completion, XP, and perfect days', () => {
    const fixture = TestBed.createComponent(Calendar);
    fixture.componentInstance.year.set(2026);
    fixture.componentInstance.month.set(10);
    fixture.componentInstance.load();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = root.textContent ?? '';
    const counts = [...root.querySelectorAll('.day-count')].map((node) => node.textContent?.trim());
    expect(counts).toEqual(['2/2', '0/1']);
    expect(text).toContain('100%');
    expect(text).toContain('80 XP');
    expect(text).toContain('Perfect');
  });
});
