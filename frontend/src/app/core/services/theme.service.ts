import { Injectable } from '@angular/core';

import { ThemePreference } from '../models/models';

const THEME_KEY = 'northstar_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private preference: ThemePreference = this.read();
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.media.addEventListener('change', () => this.apply(this.preference));
    this.apply(this.preference);
  }

  current(): ThemePreference {
    return this.preference;
  }

  apply(theme: ThemePreference): void {
    this.preference = theme;
    localStorage.setItem(THEME_KEY, theme);
    const dark = theme === 'dark' || (theme === 'system' && this.media.matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }

  private read(): ThemePreference {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  }
}
