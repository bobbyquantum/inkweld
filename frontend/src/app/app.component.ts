import { Component, HostBinding, inject, OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterOutlet } from '@angular/router';
import { UserService } from '@services/user.service';
import { UserAPIService } from '@worm/index';
import { firstValueFrom } from 'rxjs';

import { ThemeService } from '../themes/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatProgressSpinnerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @HostBinding('class') className = '';
  title = 'worm-frontend';

  protected themeService = inject(ThemeService);
  protected userAPIService = inject(UserAPIService);
  protected userService = inject(UserService);

  ngOnInit(): void {
    this.themeService.initTheme();
    firstValueFrom(this.userAPIService.userControllerGetMe()).catch(e => {
      console.log('Auth expired, clearing user from local db', e);
      void this.userService.clearCurrentUser();
    });
  }
}
