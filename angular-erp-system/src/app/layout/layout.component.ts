import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSidenavModule } from '@angular/material/sidenav';
import { map } from 'rxjs/operators';

import { FooterComponent } from './footer/footer.component';
import { HeaderComponent } from './header/header.component';
import { SidenavComponent } from './sidenav/sidenav.component';

@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSidenavModule, SidenavComponent, HeaderComponent, FooterComponent],
  template: `
    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav
        #drawer
        class="sidenav"
        [attr.role]="isHandset() ? 'dialog' : 'navigation'"
        [mode]="isHandset() ? 'over' : 'side'"
        [opened]="!isHandset()"
      >
        <app-sidenav (navigate)="isHandset() && drawer.close()" />
      </mat-sidenav>

      <mat-sidenav-content class="content">
        <app-header [isHandset]="isHandset()" (menuToggle)="drawer.toggle()" />
        <main class="main-content">
          <ng-content />
        </main>
        <app-footer />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .sidenav-container {
      height: 100vh;
    }
    .sidenav {
      width: 260px;
    }
    .content {
      display: flex;
      flex-direction: column;
    }
    .main-content {
      flex: 1;
      padding: 24px;
      width: 100%;
      max-width: 1280px;
      margin: 0 auto;
      box-sizing: border-box;
    }
    @media (max-width: 768px) {
      .main-content {
        padding: 16px;
      }
    }
  `,
})
export class LayoutComponent {
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );
}
