import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import { SidenavComponent } from './sidenav/sidenav.component';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatListModule,
    MatMenuModule,
    MatBadgeModule,
    SidenavComponent,
    HeaderComponent,
    FooterComponent
  ],
  template: `
    <div class="layout-container">
      <mat-sidenav-container class="sidenav-container">
        <mat-sidenav
          #drawer
          class="sidenav"
          fixedInViewport
          [attr.role]="(isHandset$ | async) ? 'dialog' : 'navigation'"
          [mode]="(isHandset$ | async) ? 'over' : 'side'"
          [opened]="(isHandset$ | async) === false">
          <app-sidenav (closeSidenav)="drawer.close()"></app-sidenav>
        </mat-sidenav>
        
        <mat-sidenav-content>
          <app-header 
            (menuToggle)="drawer.toggle()"
            [isHandset]="isHandset$ | async">
          </app-header>
          
          <main class="main-content">
            <div class="content-wrapper">
              <ng-content></ng-content>
            </div>
          </main>
          
          <app-footer></app-footer>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: [`
    .layout-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .sidenav-container {
      flex: 1;
    }

    .sidenav {
      width: 280px;
      background: white;
      border-right: 1px solid rgba(0, 0, 0, 0.12);
    }

    :host-context(.dark-theme) .sidenav {
      background: #424242;
      border-right: 1px solid rgba(255, 255, 255, 0.12);
    }

    .main-content {
      flex: 1;
      overflow: auto;
      background: #fafafa;
      min-height: calc(100vh - 64px - 60px); // header height - footer height
    }

    :host-context(.dark-theme) .main-content {
      background: #303030;
    }

    .content-wrapper {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    @media (max-width: 768px) {
      .content-wrapper {
        padding: 16px;
      }
    }
  `]
})
export class LayoutComponent implements OnInit {
  private breakpointObserver = inject(BreakpointObserver);

  @ViewChild('drawer') drawer!: MatSidenav;

  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );

  ngOnInit(): void {
    // Initialize layout-specific logic
  }
}