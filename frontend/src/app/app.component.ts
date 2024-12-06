import { Component, HostBinding, inject, NgZone, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User, UserAPIService } from 'worm-api-angular-client';

import { ThemeService } from '../themes/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @HostBinding('class') className = '';
  title = 'worm-frontend';
  user: User | null = null;

  protected userService = inject(UserAPIService);
  protected ngZone = inject(NgZone);
  protected themeService = inject(ThemeService);

  ngOnInit(): void {
    this.themeService.initTheme();
    firstValueFrom(this.userService.getCurrentUser())
      .then((user: User) => {
        this.user = user;
      })
      .catch(error => {
        console.log('Error', error);
        // this.redirectToLogin();
      });
  }

  redirectToLogin(): void {
    // this.ngZone.runOutsideAngular(() => {
    //   window.location.href = '/welcome';
    // });
  }
}
