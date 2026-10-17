import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Store } from '@ngrx/store';

import * as AuthActions from '@core/store/auth/auth.actions';
import { selectAuthError, selectAuthLoading } from '@core/store/auth/auth.selectors';
import { environment } from '@environments/environment';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="login-form" novalidate>
      <h2>Sign in</h2>

      @if (error(); as message) {
        <div class="error" role="alert">{{ message }}</div>
      }

      <mat-form-field>
        <mat-label>Email</mat-label>
        <input matInput type="email" formControlName="email" autocomplete="username" />
        <mat-icon matSuffix>email</mat-icon>
        @if (form.controls.email.invalid) {
          <mat-error>Enter a valid email address</mat-error>
        }
      </mat-form-field>

      <mat-form-field>
        <mat-label>Password</mat-label>
        <input
          matInput
          [type]="hidePassword() ? 'password' : 'text'"
          formControlName="password"
          autocomplete="current-password"
        />
        <button
          mat-icon-button
          matSuffix
          type="button"
          [attr.aria-label]="hidePassword() ? 'Show password' : 'Hide password'"
          (click)="hidePassword.set(!hidePassword())"
        >
          <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
        @if (form.controls.password.invalid) {
          <mat-error>Password must be at least 6 characters</mat-error>
        }
      </mat-form-field>

      <mat-checkbox formControlName="rememberMe">Remember me</mat-checkbox>

      <button mat-flat-button type="submit" class="submit" [disabled]="loading()">
        @if (loading()) {
          <mat-spinner diameter="20" />
        } @else {
          Sign in
        }
      </button>

      @if (demoMode) {
        <p class="hint">
          Demo mode: sign in as <code>admin&#64;erp.local</code> or <code>warehouse&#64;erp.local</code>
          (see README for the demo password).
        </p>
      }
    </form>
  `,
  styles: `
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    h2 {
      margin: 0 0 8px;
      font-weight: 500;
    }
    .error {
      padding: 12px;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .submit {
      height: 44px;
      margin-top: 8px;
    }
    .hint {
      font-size: 0.8rem;
      opacity: 0.75;
    }
  `,
})
export class LoginComponent {
  private readonly store = inject(Store);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly demoMode = environment.enableMocking;
  protected readonly hidePassword = signal(true);
  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly error = this.store.selectSignal(selectAuthError);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [false],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.store.dispatch(AuthActions.login(this.form.getRawValue()));
  }
}
