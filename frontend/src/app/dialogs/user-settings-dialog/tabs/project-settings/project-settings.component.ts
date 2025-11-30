import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SettingsService } from '@services/core/settings.service';

@Component({
  selector: 'app-project-settings',
  standalone: true,
  imports: [FormsModule, MatCheckboxModule, MatFormFieldModule],
  templateUrl: './project-settings.component.html',
  styleUrl: './project-settings.component.scss',
})
export class ProjectSettingsComponent {
  private settingsService = inject(SettingsService);

  get zenModeFullscreen(): boolean {
    return this.settingsService.getSetting<boolean>('zenModeFullscreen', true);
  }

  set zenModeFullscreen(value: boolean) {
    if (typeof value === 'boolean') {
      this.settingsService.setSetting<boolean>('zenModeFullscreen', value);
    } else {
      this.settingsService.setSetting<boolean>('zenModeFullscreen', true);
    }
  }

  get useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }

  set useTabsDesktop(value: boolean) {
    if (typeof value === 'boolean') {
      this.settingsService.setSetting<boolean>('useTabsDesktop', value);
    } else {
      this.settingsService.setSetting<boolean>('useTabsDesktop', true);
    }
  }
}
