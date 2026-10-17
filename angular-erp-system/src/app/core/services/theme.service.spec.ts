import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('toggles between light and dark and applies the body class', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setTheme('light');
    TestBed.tick();
    expect(document.body.classList.contains('light-theme')).toBe(true);

    theme.toggleTheme();
    TestBed.tick();
    expect(theme.isDark()).toBe(true);
    expect(document.body.classList.contains('dark-theme')).toBe(true);
    expect(localStorage.getItem('erp.theme')).toBe('dark');
  });
});
