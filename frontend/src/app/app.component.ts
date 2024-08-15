import { Component, HostBinding, NgZone } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { User, UserAPIService } from 'worm-api-client';
import { firstValueFrom } from 'rxjs';
import { ThemeService } from '../themes/theme.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet
],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'worm-frontend';
  user: User | null = null;
  @HostBinding('class') className = '';
  constructor(private userService: UserAPIService, private ngZone: NgZone, protected themeService: ThemeService) {
  }

  ngOnInit(): void {
    this.themeService.initTheme()
    firstValueFrom(this.userService.getCurrentUser()).then((user: User) => {
      this.user = user;
    }).catch((error: any) => {
      this.ngZone.runOutsideAngular(() => {
        window.location.href = '/login';
      });
    });
  }
}
