import { Component, HostBinding, inject, OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterOutlet } from '@angular/router';

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
  private router = inject(Router);

  ngOnInit(): void {
    this.themeService.initTheme();
  }
}
