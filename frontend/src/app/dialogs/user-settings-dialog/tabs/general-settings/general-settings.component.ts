import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-general-settings',
  imports: [MatFormFieldModule, MatSelectModule, FormsModule],
  templateUrl: './general-settings.component.html',
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
  private themeService = inject(ThemeService);

  selectedTheme!: ThemeOption;

  private themeSubscription!: Subscription;

  ngOnInit() {
    this.themeSubscription = this.themeService
      .getCurrentTheme()
      .subscribe(theme => {
        this.selectedTheme = theme;
      });
  }

  ngOnDestroy() {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }

  onThemeChange() {
    this.themeService.update(this.selectedTheme);
  }
}
