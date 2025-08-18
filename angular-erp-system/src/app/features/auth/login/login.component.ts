import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Store } from '@ngrx/store';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import * as AuthActions from '@core/store/auth/auth.actions';
import { selectAuthLoading, selectAuthError } from '@core/store/auth/auth.selectors';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="login-form">
      <h2>Welcome Back</h2>
      <p>Please sign in to your account</p>

      @if (error$ | async; as error) {
        <div class="error-message">{{ error }}</div>
      }

      <mat-form-field appearance="outline" class="form-field">
        <mat-label>Email</mat-label>
        <input matInput type="email" formControlName="email" required>
        <mat-icon matSuffix>email</mat-icon>
        @if (loginForm.get('email')?.invalid && loginForm.get('email')?.touched) {
          <mat-error>Please enter a valid email</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="form-field">
        <mat-label>Password</mat-label>
        <input matInput [type]="hidePassword ? 'password' : 'text'" formControlName="password" required>
        <button type="button" mat-icon-button matSuffix (click)="hidePassword = !hidePassword">
          <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
        @if (loginForm.get('password')?.invalid && loginForm.get('password')?.touched) {
          <mat-error>Password is required</mat-error>
        }
      </mat-form-field>

      <div class="form-options">
        <mat-checkbox formControlName="rememberMe">Remember me</mat-checkbox>
        <a routerLink="../forgot-password" class="forgot-password-link">Forgot password?</a>
      </div>

      <button 
        mat-raised-button 
        color="primary" 
        type="submit" 
        class="submit-button"
        [disabled]="loginForm.invalid || (loading$ | async)">
        @if (loading$ | async) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Sign In
        }
      </button>

      <div class="register-link">
        Don't have an account? 
        <a routerLink="../register">Create one here</a>
      </div>
    </form>
  `,
  styles: [`
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h2 {
      font-size: 1.5rem;
      font-weight: 500;
      margin: 0;
      text-align: center;
      color: rgba(0, 0, 0, 0.87);
    }

    p {
      text-align: center;
      margin: 0;
      color: rgba(0, 0, 0, 0.6);
    }

    .error-message {
      background-color: #ffebee;
      color: #c62828;
      padding: 12px;
      border-radius: 4px;
      border-left: 4px solid #f44336;
      font-size: 0.875rem;
    }

    .form-field {
      width: 100%;
    }

    .form-options {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 8px 0;
    }

    .forgot-password-link {
      color: #1976d2;
      text-decoration: none;
      font-size: 0.875rem;
    }

    .forgot-password-link:hover {
      text-decoration: underline;
    }

    .submit-button {
      height: 48px;
      font-size: 1rem;
      margin-top: 8px;
    }

    .register-link {
      text-align: center;
      margin-top: 16px;
      font-size: 0.875rem;
      color: rgba(0, 0, 0, 0.6);
    }

    .register-link a {
      color: #1976d2;
      text-decoration: none;
    }

    .register-link a:hover {
      text-decoration: underline;
    }
  `]
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private store = inject(Store);

  hidePassword = true;
  loading$ = this.store.select(selectAuthLoading);
  error$ = this.store.select(selectAuthError);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [false]
  });

  onSubmit(): void {
    if (this.loginForm.valid) {
      const { email, password, rememberMe } = this.loginForm.value;
      this.store.dispatch(AuthActions.login({ email, password, rememberMe }));
    }
  }
}