import { Component, HostBinding, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterOutlet } from '@angular/router';
import { UserAPIService } from '@inkweld/index';
import { UserService } from '@services/user.service';
import { firstValueFrom } from 'rxjs';

import { ThemeService } from '../themes/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatButtonModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @HostBinding('class') className = '';
  title = 'inkweld-frontend';

  protected readonly offlineMode = signal(false);
  protected readonly themeService = inject(ThemeService);
  protected readonly userAPIService = inject(UserAPIService);
  protected readonly userService = inject(UserService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.themeService.initTheme();
    void this.loadUser();
  }

  protected async handleReAuthenticate(): Promise<void> {
    this.offlineMode.set(false);
    await this.userService.clearCurrentUser();
    await this.router.navigate(['/welcome']);
  }

  protected handleContinueOffline(): void {
    this.offlineMode.set(true);
  }

  private async loadUser(): Promise<void> {
    try {
      await firstValueFrom(this.userAPIService.userControllerGetMe());
      await this.userService.loadCurrentUser();
    } catch (e) {
      console.log('Load user fail.. this needs better handling', e);
    }
  }
}
