import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule],
  template: `
    <section class="not-found">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or has moved.</p>
      <a mat-flat-button routerLink="/">Back to the catalog</a>
    </section>
  `,
  styles: `
    .not-found {
      text-align: center;
      padding: 64px 16px;
    }
  `,
})
export class NotFoundComponent {}
