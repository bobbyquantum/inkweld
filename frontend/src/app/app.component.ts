import {
  Component,
  HostBinding,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  Event,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { ThemeService } from '../themes/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatProgressSpinnerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  @HostBinding('class') className = '';
  title = 'worm-frontend';
  isLoading = false;

  protected themeService = inject(ThemeService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.themeService.initTheme();
    this.setupRouterEvents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupRouterEvents(): void {
    this.router.events
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: Event) => {
        if (event instanceof NavigationStart) {
          this.isLoading = true;
        } else if (event instanceof NavigationEnd) {
          this.isLoading = false;
        }
      });
  }
}
