import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';

import { AuthStore } from '@core/auth.store';

/** Only same-origin, path-absolute return URLs are honoured (prevents open redirects). */
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/my-learning';
}

@Component({
  selector: 'app-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <mat-card appearance="outlined" class="card">
      <mat-card-header>
        <mat-card-title><h1>Sign in</h1></mat-card-title>
        <mat-card-subtitle>
          Demo mode: your name and email stay in this browser. No password or account is created.
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <mat-form-field>
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" autocomplete="name" />
            @if (form.controls.name.invalid) {
              <mat-error>Please enter your name</mat-error>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" />
            @if (form.controls.email.invalid) {
              <mat-error>Please enter a valid email</mat-error>
            }
          </mat-form-field>
          <button mat-flat-button type="submit">Continue</button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .card {
      max-width: 440px;
      margin: 48px auto;
    }
    h1 {
      margin: 0;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 16px;
    }
  `,
})
export class SignInComponent {
  /** Bound from the `returnUrl` query parameter. */
  readonly returnUrl = input<string>();

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.auth.signIn(this.form.getRawValue());
    void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
  }
}
