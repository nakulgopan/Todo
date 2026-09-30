import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PRIORITY_POINTS } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';
import { ProductivityService } from '../../core/services/productivity.service';
import { ThemeService } from '../../core/services/theme.service';
import { errorMessage } from '../../core/utils/dates';

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <header class="page-head">
      <div>
        <h1>Profile</h1>
        <p>Your name, goal, and how DaleRoute looks.</p>
      </div>
      <button mat-stroked-button type="button" (click)="logout()">Log out</button>
    </header>
    <section class="panel form-panel">
      <h2>Account</h2>
      <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Avatar URL</mat-label>
          <input matInput formControlName="avatar_url" />
        </mat-form-field>
        @if (profileForm.controls.avatar_url.value) {
          <img class="avatar span-2" [src]="profileForm.controls.avatar_url.value" alt="Avatar preview" />
        }
        <mat-form-field appearance="outline">
          <mat-label>Daily goal (XP)</mat-label>
          <input matInput type="number" formControlName="daily_goal" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Theme</mat-label>
          <mat-select formControlName="theme">
            <mat-option value="light">Light</mat-option>
            <mat-option value="dark">Dark</mat-option>
            <mat-option value="system">System</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="span-2 toggles" formGroupName="notifications">
          <mat-slide-toggle formControlName="reminders">Reminders</mat-slide-toggle>
          <mat-slide-toggle formControlName="achievements">Achievement alerts</mat-slide-toggle>
          <mat-slide-toggle formControlName="email">Email updates</mat-slide-toggle>
        </div>
        <div class="span-2 points" formGroupName="default_points">
          @for (priority of priorities; track priority) {
            <mat-form-field appearance="outline">
              <mat-label>{{ priority }} points</mat-label>
              <input matInput type="number" [formControlName]="priority" />
            </mat-form-field>
          }
        </div>
        <button mat-flat-button color="primary" type="submit">Save settings</button>
      </form>
    </section>
    <section class="panel form-panel">
      <h2>Change password</h2>
      <form [formGroup]="passwordForm" (ngSubmit)="savePassword()" class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Current password</mat-label>
          <input matInput type="password" formControlName="current_password" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>New password</mat-label>
          <input matInput type="password" formControlName="new_password" />
        </mat-form-field>
        @if (message()) {
          <p class="form-error span-2">{{ message() }}</p>
        }
        <button mat-stroked-button type="submit">Update password</button>
      </form>
    </section>
  `,
  styles: `
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
    .span-2 { grid-column: span 2; }
    .toggles, .points { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-bottom: 12px; }
    .avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin-bottom: 12px; }
    @media (max-width: 720px) { .form-grid, .span-2 { display: block; } }
  `,
})
export class Profile {
  private readonly api = inject(ProductivityService);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly snack = inject(MatSnackBar);
  readonly priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
  readonly message = signal('');
  readonly profileForm = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    avatar_url: [''],
    daily_goal: [100, [Validators.required, Validators.min(1)]],
    theme: ['system' as 'light' | 'dark' | 'system'],
    notifications: inject(FormBuilder).nonNullable.group({
      reminders: [true],
      achievements: [true],
      email: [false],
    }),
    default_points: inject(FormBuilder).nonNullable.group({
      LOW: [PRIORITY_POINTS.LOW],
      MEDIUM: [PRIORITY_POINTS.MEDIUM],
      HIGH: [PRIORITY_POINTS.HIGH],
      URGENT: [PRIORITY_POINTS.URGENT],
    }),
  });
  readonly passwordForm = inject(FormBuilder).nonNullable.group({
    current_password: ['', Validators.required],
    new_password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    this.api.profile().subscribe((profile) => {
      this.profileForm.patchValue(profile.settings);
      this.profileForm.patchValue({
        name: profile.user.name,
        email: profile.user.email,
        avatar_url: profile.user.avatar_url ?? '',
      });
      this.auth.currentUser.set(profile.user);
      this.theme.apply(profile.settings.theme);
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const value = this.profileForm.getRawValue();
    this.api.updateProfile(value).subscribe({
      next: (profile) => {
        this.auth.currentUser.set(profile.user);
        this.theme.apply(profile.settings.theme);
        this.snack.open('Settings saved', 'Close', { duration: 2500 });
      },
      error: (error: unknown) => this.snack.open(errorMessage(error), 'Close', { duration: 3500 }),
    });
  }

  savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.message.set('');
    this.api.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.snack.open('Password updated', 'Close', { duration: 2500 });
      },
      error: (error: unknown) => this.message.set(errorMessage(error)),
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
