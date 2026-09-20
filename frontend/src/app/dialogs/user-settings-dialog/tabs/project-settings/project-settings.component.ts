import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';
import { AutoSnapshotService } from '@services/project/auto-snapshot.service';

@Component({
  selector: 'app-project-settings',
  imports: [MatSlideToggleModule, MatFormFieldModule, TranslocoModule],
  templateUrl: './project-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './project-settings.component.scss',
})
export class ProjectSettingsComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly autoSnapshotService = inject(AutoSnapshotService);

  get zenModeFullscreen(): boolean {
    return this.settingsService.getSetting<boolean>('zenModeFullscreen', true);
  }

  setZenModeFullscreen(value: boolean): void {
    if (typeof value === 'boolean') {
      this.settingsService.setSetting<boolean>('zenModeFullscreen', value);
    } else {
      this.settingsService.setSetting<boolean>('zenModeFullscreen', true);
    }
  }

  get useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }

  setUseTabsDesktop(value: boolean): void {
    if (typeof value === 'boolean') {
      this.settingsService.setSetting<boolean>('useTabsDesktop', value);
    } else {
      this.settingsService.setSetting<boolean>('useTabsDesktop', true);
    }
  }

  get autoSnapshots(): boolean {
    return this.autoSnapshotService.isEnabled();
  }

  setAutoSnapshots(value: boolean): void {
    if (typeof value === 'boolean') {
      this.autoSnapshotService.setEnabled(value);
    } else {
      this.autoSnapshotService.setEnabled(true);
    }
  }
}
