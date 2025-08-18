import { Injectable, inject, Renderer2, RendererFactory2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable, BehaviorSubject, fromEvent } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';

import * as ThemeActions from '@core/store/theme/theme.actions';
import { selectCurrentTheme, selectIsDarkMode } from '@core/store/theme/theme.selectors';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private store = inject(Store);
  private document = inject(DOCUMENT);
  private rendererFactory = inject(RendererFactory2);
  private renderer = this.rendererFactory.createRenderer(null, null);

  private readonly THEME_KEY = 'theme-preference';
  private mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');

  // Observables
  public readonly currentTheme$ = this.store.select(selectCurrentTheme);
  public readonly isDarkTheme$ = this.store.select(selectIsDarkMode);

  constructor() {
    this.initializeTheme();
    this.watchSystemThemeChanges();
  }

  initializeTheme(): void {
    // Load saved theme preference
    const savedTheme = this.getSavedTheme();
    const systemPrefersDark = this.mediaQueryList.matches;
    
    // Set system theme preference
    this.store.dispatch(ThemeActions.setSystemTheme({ isDark: systemPrefersDark }));
    
    // Set initial theme
    this.store.dispatch(ThemeActions.setTheme({ theme: savedTheme }));
    
    // Apply theme to DOM
    this.applyTheme(savedTheme, systemPrefersDark);
    
    // Subscribe to theme changes
    this.isDarkTheme$.subscribe(isDark => {
      this.updateDOMTheme(isDark);
    });
  }

  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.store.dispatch(ThemeActions.setTheme({ theme }));
    this.saveTheme(theme);
    
    const systemPrefersDark = this.mediaQueryList.matches;
    this.applyTheme(theme, systemPrefersDark);
  }

  toggleTheme(): void {
    this.store.dispatch(ThemeActions.toggleTheme());
    
    // Get current theme and save it
    this.currentTheme$.pipe(
      distinctUntilChanged()
    ).subscribe(theme => {
      this.saveTheme(theme);
      const systemPrefersDark = this.mediaQueryList.matches;
      this.applyTheme(theme, systemPrefersDark);
    });
  }

  private applyTheme(theme: 'light' | 'dark' | 'auto', systemPrefersDark: boolean): void {
    const isDark = theme === 'dark' || (theme === 'auto' && systemPrefersDark);
    this.updateDOMTheme(isDark);
  }

  private updateDOMTheme(isDark: boolean): void {
    const body = this.document.body;
    
    if (isDark) {
      this.renderer.addClass(body, 'dark-theme');
      this.renderer.removeClass(body, 'light-theme');
    } else {
      this.renderer.addClass(body, 'light-theme');
      this.renderer.removeClass(body, 'dark-theme');
    }
    
    // Update meta theme-color for mobile browsers
    this.updateMetaThemeColor(isDark);
    
    // Dispatch custom event for components that need to respond to theme changes
    this.document.dispatchEvent(new CustomEvent('themeChanged', {
      detail: { isDark }
    }));
  }

  private updateMetaThemeColor(isDark: boolean): void {
    const metaThemeColor = this.document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#424242' : '#1976d2');
    }
  }

  private watchSystemThemeChanges(): void {
    // Modern browsers
    if (this.mediaQueryList.addEventListener) {
      this.mediaQueryList.addEventListener('change', (e) => {
        this.store.dispatch(ThemeActions.setSystemTheme({ isDark: e.matches }));
      });
    } else {
      // Legacy browsers
      this.mediaQueryList.addListener((e) => {
        this.store.dispatch(ThemeActions.setSystemTheme({ isDark: e.matches }));
      });
    }
  }

  private getSavedTheme(): 'light' | 'dark' | 'auto' {
    const saved = localStorage.getItem(this.THEME_KEY) as 'light' | 'dark' | 'auto';
    return saved || 'auto';
  }

  private saveTheme(theme: 'light' | 'dark' | 'auto'): void {
    localStorage.setItem(this.THEME_KEY, theme);
  }

  // Utility methods for components
  getThemeClass(): Observable<string> {
    return this.isDarkTheme$.pipe(
      map(isDark => isDark ? 'dark-theme' : 'light-theme')
    );
  }

  getThemeColors(): Observable<{ primary: string; accent: string; background: string }> {
    return this.isDarkTheme$.pipe(
      map(isDark => ({
        primary: isDark ? '#64b5f6' : '#1976d2',
        accent: isDark ? '#f48fb1' : '#e91e63',
        background: isDark ? '#303030' : '#fafafa'
      }))
    );
  }

  // Check if user prefers reduced motion
  prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // High contrast mode detection
  prefersHighContrast(): boolean {
    return window.matchMedia('(prefers-contrast: high)').matches;
  }
}