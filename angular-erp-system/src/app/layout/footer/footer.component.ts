import { ChangeDetectionStrategy, Component } from '@angular/core';

import { environment } from '@environments/environment';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer>
      <span>{{ appName }}</span>
      <span>v{{ version }}{{ demo ? ' - demo data' : '' }}</span>
    </footer>
  `,
  styles: `
    footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 24px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
  `,
})
export class FooterComponent {
  protected readonly appName = environment.appName;
  protected readonly version = environment.appVersion;
  protected readonly demo = environment.enableMocking;
}
