import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

import { storage } from './storage';

const KEY = 'lms.theme';

/** Light/dark preference stored per browser; defaults to the OS setting. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly isDark = signal<boolean>(
    storage.read<boolean>(KEY) ??
      this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ??
      false,
  );

  constructor() {
    effect(() => {
      const dark = this.isDark();
      this.document.body.classList.toggle('dark-theme', dark);
      storage.write(KEY, dark);
    });
  }

  toggle(): void {
    this.isDark.update((dark) => !dark);
  }
}
