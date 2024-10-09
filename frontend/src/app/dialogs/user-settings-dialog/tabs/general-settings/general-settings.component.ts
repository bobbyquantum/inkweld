import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ThemeService, ThemeOption } from '@themes/theme.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-general-settings',
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule, MatInputModule, FormsModule],
  templateUrl: './general-settings.component.html',
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
  selectedTheme!: ThemeOption;
  private themeSubscription!: Subscription;

  constructor(private themeService: ThemeService) {
    console.log('GeneralSettingsComponent constructed');
  }

  ngOnInit() {
    console.log('GeneralSettingsComponent initialized');
    this.themeSubscription = this.themeService
      .getCurrentTheme()
      .subscribe(theme => {
        console.log('Current theme:', theme);
        this.selectedTheme = theme;
      });
  }

  ngOnDestroy() {
    console.log('GeneralSettingsComponent destroyed');
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }

  onThemeChange() {
    console.log('Theme changed to:', this.selectedTheme);
    this.themeService.update(this.selectedTheme);
  }
}
