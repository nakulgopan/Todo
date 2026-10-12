import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../core/services/auth.service';
import { ProductivityService } from '../core/services/productivity.service';
import { ThemeService } from '../core/services/theme.service';
import { Shell } from './shell';

describe('Shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: signal({ name: 'Nakul', id: '1', email: 'nakul@example.com', created_at: '', updated_at: '' }),
            logout: () => undefined,
            clearSession: () => undefined,
            loadCurrentUser: () => of(null),
          },
        },
        {
          provide: ProductivityService,
          useValue: {
            profile: () => of({ user: { name: 'Nakul' }, settings: { theme: 'light' } }),
          },
        },
        { provide: ThemeService, useValue: { apply: () => undefined } },
      ],
    }).compileComponents();
  });

  it('closes the sidebar after a menu option is selected', () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).not.toBeNull();

    const tasks = [...fixture.nativeElement.querySelectorAll('.sidebar nav a')].find((link: HTMLAnchorElement) =>
      link.textContent?.includes('Tasks'),
    ) as HTMLAnchorElement;
    tasks.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.menuOpen()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.sidebar.open')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).toBeNull();
  });
});
