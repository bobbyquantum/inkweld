import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { type ThemeOption, ThemeService } from '@themes/theme.service';
import { type Subscription } from 'rxjs';

@Component({
  selector: 'app-general-settings',
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './general-settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
  private readonly themeService = inject(ThemeService);

  readonly selectedTheme = signal<ThemeOption>('system');

  private themeSubscription!: Subscription;

  ngOnInit() {
    this.themeSubscription = this.themeService
      .getCurrentTheme()
      .subscribe(theme => {
        this.selectedTheme.set(theme);
      });
  }

  ngOnDestroy() {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }

  onThemeChange(value: ThemeOption) {
    this.selectedTheme.set(value);
    this.themeService.update(value);
  }
}
