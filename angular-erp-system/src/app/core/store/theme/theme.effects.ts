import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { tap } from 'rxjs/operators';
import * as ThemeActions from './theme.actions';

@Injectable()
export class ThemeEffects {
  private actions$ = inject(Actions);

  saveThemePreference$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ThemeActions.setTheme),
      tap(({ theme }) => {
        localStorage.setItem('theme-preference', theme);
      })
    ),
    { dispatch: false }
  );
}