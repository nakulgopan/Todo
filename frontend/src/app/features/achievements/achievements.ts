import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { Achievement } from '../../core/models/models';
import { ProductivityService } from '../../core/services/productivity.service';

@Component({
  selector: 'app-achievements',
  imports: [MatIconModule, DatePipe],
  template: `
    <header class="page-head">
      <div>
        <h1>Achievements</h1>
        <p>{{ unlockedCount() }} of {{ items().length }} unlocked</p>
      </div>
    </header>
    <section class="achievement-grid">
      @for (item of items(); track item.code) {
        <article class="achievement" [class.locked]="!item.unlocked">
          <mat-icon>{{ item.icon }}</mat-icon>
          <div>
            <h2>{{ item.name }}</h2>
            <p>{{ item.description }}</p>
            @if (item.unlocked_at) {
              <small>Unlocked {{ item.unlocked_at | date: 'mediumDate' }}</small>
            }
          </div>
        </article>
      }
    </section>
  `,
})
export class Achievements {
  private readonly api = inject(ProductivityService);
  readonly items = signal<Achievement[]>([]);

  constructor() {
    this.api.achievements().subscribe((response) => this.items.set(response.achievements));
  }

  unlockedCount(): number {
    return this.items().filter((item) => item.unlocked).length;
  }
}
