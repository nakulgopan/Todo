import { Component, inject, signal } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

import { StatsView } from '../../core/models/models';
import { ProductivityService } from '../../core/services/productivity.service';

@Component({
  selector: 'app-statistics',
  imports: [BaseChartDirective],
  template: `
    <header class="page-head">
      <div>
        <h1>Statistics</h1>
        <p>XP, completion, and the shape of the last few weeks.</p>
      </div>
    </header>
    @if (stats(); as view) {
      <section class="metric-grid">
        <article><span>Daily XP</span><strong class="daily-xp">{{ view.daily_xp }}</strong></article>
        <article><span>Weekly XP</span><strong>{{ view.weekly_xp }}</strong></article>
        <article><span>Monthly XP</span><strong>{{ view.monthly_xp }}</strong></article>
        <article><span>Completion</span><strong>{{ view.completion_percentage }}%</strong></article>
        <article><span>Average daily XP</span><strong>{{ view.average_daily_xp }}</strong></article>
        <article><span>Current streak</span><strong>{{ view.current_streak }}</strong></article>
        <article><span>Longest streak</span><strong>{{ view.longest_streak }}</strong></article>
        <article><span>Tasks completed</span><strong>{{ view.total_completed_tasks }}</strong></article>
        <article><span>Total XP</span><strong class="total-xp">{{ view.total_xp }}</strong></article>
        <article><span>Best day</span><strong>{{ view.best_day ? view.best_day.xp + ' XP' : '—' }}</strong></article>
      </section>
      <section class="chart-grid">
        <article class="panel">
          <h2>XP by day</h2>
          <canvas baseChart class="xp-chart" type="bar" [data]="xpChart" [options]="options"></canvas>
        </article>
        <article class="panel">
          <h2>Tasks completed by day</h2>
          <canvas baseChart type="bar" [data]="taskChart" [options]="options"></canvas>
        </article>
        <article class="panel">
          <h2>Weekly completion</h2>
          <canvas baseChart type="line" [data]="weekChart" [options]="options"></canvas>
        </article>
        <article class="panel">
          <h2>Monthly completion</h2>
          <canvas baseChart type="line" [data]="monthChart" [options]="options"></canvas>
        </article>
      </section>
    } @else {
      <div class="skeleton-list"><span></span><span></span></div>
    }
  `,
})
export class Statistics {
  private readonly api = inject(ProductivityService);
  readonly stats = signal<StatsView | null>(null);
  xpChart: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  taskChart: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  weekChart: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  monthChart: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  readonly options: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  constructor() {
    this.api.stats().subscribe((view) => {
      this.stats.set(view);
      this.xpChart = {
        labels: view.xp_by_day.map((item) => item.date.slice(5)),
        datasets: [{ data: view.xp_by_day.map((item) => item.xp), label: 'XP', backgroundColor: '#1f7a4d' }],
      };
      this.taskChart = {
        labels: view.tasks_completed_by_day.map((item) => item.date.slice(5)),
        datasets: [{ data: view.tasks_completed_by_day.map((item) => item.completed), backgroundColor: '#c9841a' }],
      };
      this.weekChart = {
        labels: view.weekly_completion.map((item) => item.label.slice(5)),
        datasets: [{ data: view.weekly_completion.map((item) => item.percentage), borderColor: '#1f7a4d', tension: 0.3 }],
      };
      this.monthChart = {
        labels: view.monthly_completion.map((item) => item.label),
        datasets: [{ data: view.monthly_completion.map((item) => item.percentage), borderColor: '#0f3d2c', tension: 0.3 }],
      };
    });
  }
}
