import { TestBed } from '@angular/core/testing';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { of } from 'rxjs';

import { StatsView } from '../../core/models/models';
import { ProductivityService } from '../../core/services/productivity.service';
import { Statistics } from './statistics';

const stats: StatsView = {
  daily_xp: 40,
  weekly_xp: 180,
  monthly_xp: 640,
  completion_percentage: 75,
  average_daily_xp: 32.5,
  current_streak: 4,
  longest_streak: 9,
  weekly_streak: 1,
  monthly_streak: 1,
  total_completed_tasks: 28,
  total_xp: 860,
  best_day: { date: '2026-09-30', xp: 130, date_label: 'Wednesday, 30 September' },
  xp_by_day: [{ date: '2026-09-30', xp: 40 }],
  tasks_completed_by_day: [{ date: '2026-09-30', completed: 3 }],
  weekly_completion: [{ label: '2026-09-28', percentage: 80 }],
  monthly_completion: [{ label: 'Sep 2026', percentage: 70 }],
};

describe('Statistics', () => {
  beforeEach(async () => {
    const productivity = jasmine.createSpyObj('ProductivityService', ['stats']);
    productivity.stats.and.returnValue(of(stats));
    await TestBed.configureTestingModule({
      imports: [Statistics],
      providers: [provideCharts(withDefaultRegisterables()), { provide: ProductivityService, useValue: productivity }],
    }).compileComponents();
  });

  it('renders score, streak, and chart summaries', () => {
    const fixture = TestBed.createComponent(Statistics);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('40');
    expect(text).toContain('180');
    expect(text).toContain('860');
    expect(text).toContain('75%');
    expect(text).toContain('28');
    expect(fixture.nativeElement.querySelector('.xp-chart')).toBeTruthy();
    expect(fixture.componentInstance.xpChart.datasets[0].data).toEqual([40]);
  });
});
