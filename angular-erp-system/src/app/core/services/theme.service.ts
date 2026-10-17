import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'erp.theme';

/**
 * Signal-based theme state. UI-only state like this lives in signals rather than
 * the NgRx store, which is reserved for shared domain state with side effects.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  readonly preference = signal<ThemePreference>(this.readPreference());
  private readonly systemPrefersDark = signal(this.media?.matches ?? false);

  readonly isDark = computed(
    () =>
      this.preference() === 'dark' || (this.preference() === 'auto' && this.systemPrefersDark()),
  );

  constructor() {
    this.media?.addEventListener?.('change', (event) => this.systemPrefersDark.set(event.matches));

    effect(() => {
      const dark = this.isDark();
      const body = this.document.body;
      body.classList.toggle('dark-theme', dark);
      body.classList.toggle('light-theme', !dark);
      body.style.colorScheme = dark ? 'dark' : 'light';
      this.document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#1f1f1f' : '#005cbb');
    });

    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.preference());
      } catch {
        // Storage can be unavailable (private mode); the preference simply won't persist.
      }
    });
  }

  setTheme(preference: ThemePreference): void {
    this.preference.set(preference);
  }

  toggleTheme(): void {
    this.preference.set(this.isDark() ? 'light' : 'dark');
  }

  private readPreference(): ThemePreference {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
    } catch {
      return 'auto';
    }
  }
}
