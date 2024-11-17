import { Component, HostBinding, inject, NgZone, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User, UserAPIService } from 'worm-api-client';

import { ThemeService } from '../themes/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'worm-frontend';
  user: User | null = null;
  @HostBinding('class') className = '';

  private userService = inject(UserAPIService);
  private ngZone = inject(NgZone);
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
