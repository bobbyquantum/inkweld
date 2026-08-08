import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SettingsService } from '@services/core/settings.service';
import { AutoSnapshotService } from '@services/project/auto-snapshot.service';

@Component({
  selector: 'app-project-settings',
  imports: [MatCheckboxModule, MatFormFieldModule],
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
    this.settingsService.setSetting<boolean>(
      'zenModeFullscreen',
      typeof value === 'boolean' ? value : true
    );
  }

  get useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }

  setUseTabsDesktop(value: boolean): void {
    this.settingsService.setSetting<boolean>(
      'useTabsDesktop',
      typeof value === 'boolean' ? value : true
    );
  }

  get autoSnapshots(): boolean {
    return this.autoSnapshotService.isEnabled();
  }

  setAutoSnapshots(value: boolean): void {
    this.autoSnapshotService.setEnabled(
      typeof value === 'boolean' ? value : true
    );
  }
}
