import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { HistoryItem } from '../../core/models/models';
import { ProductivityService } from '../../core/services/productivity.service';
import { DayDialog } from '../../shared/dialogs/day-dialog';

@Component({
  selector: 'app-history',
  imports: [],
  template: `
    <header class="page-head">
      <div>
        <h1>History</h1>
        <p>Days you showed up, and the score they left behind.</p>
      </div>
    </header>
    @if (loading()) {
      <div class="skeleton-list"><span></span><span></span><span></span></div>
    } @else if (items().length === 0) {
      <div class="empty-state">
        <h3>No history yet</h3>
        <p>Complete a task and the day will be recorded here.</p>
      </div>
    } @else {
      <div class="history-table">
        <div class="history-row head">
          <span>Date</span><span>Completed</span><span>Total</span><span>Completion</span><span>XP</span><span>Streak</span>
        </div>
        @for (item of items(); track item.date) {
          <button type="button" class="history-row" (click)="open(item)">
            <span>{{ item.date_label }}</span>
            <span>{{ item.completed_tasks }}</span>
            <span>{{ item.total_tasks }}</span>
            <span>{{ item.completion_percentage }}%</span>
            <span>{{ item.xp }}</span>
            <span>🔥 {{ item.streak }}</span>
          </button>
        }
      </div>
    }
  `,
})
export class History {
  private readonly api = inject(ProductivityService);
  private readonly dialog = inject(MatDialog);
  readonly loading = signal(true);
  readonly items = signal<HistoryItem[]>([]);

  constructor() {
    this.api.history().subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(item: HistoryItem): void {
    this.dialog.open(DayDialog, { width: '560px', maxWidth: '95vw', data: item.date });
  }
}
