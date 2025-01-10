import { Component, HostBinding, inject, NgZone, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

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
  protected ngZone = inject(NgZone);
  protected themeService = inject(ThemeService);

  ngOnInit(): void {
    this.themeService.initTheme();
  }
}
