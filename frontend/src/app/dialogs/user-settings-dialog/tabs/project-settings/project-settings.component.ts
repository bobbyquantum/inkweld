import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SettingsService } from '@services/core/settings.service';
import { AutoSnapshotService } from '@services/project/auto-snapshot.service';

@Component({
  selector: 'app-project-settings',
  imports: [FormsModule, MatCheckboxModule, MatFormFieldModule],
  templateUrl: './project-settings.component.html',
  styleUrl: './project-settings.component.scss',
})
export class ProjectSettingsComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly autoSnapshotService = inject(AutoSnapshotService);

  get zenModeFullscreen(): boolean {
    return this.settingsService.getSetting<boolean>('zenModeFullscreen', true);
  }

  set zenModeFullscreen(value: boolean) {
    this.settingsService.setSetting<boolean>('zenModeFullscreen', value);
  }

  get useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }

  set useTabsDesktop(value: boolean) {
    this.settingsService.setSetting<boolean>('useTabsDesktop', value);
  }

  get autoSnapshots(): boolean {
    return this.autoSnapshotService.isEnabled();
  }

  set autoSnapshots(value: boolean) {
    this.autoSnapshotService.setEnabled(value);
  }
}
