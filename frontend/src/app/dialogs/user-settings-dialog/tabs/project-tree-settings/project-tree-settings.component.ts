import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SettingsService } from '@services/core/settings.service';

@Component({
  selector: 'app-project-tree-settings',
  imports: [MatCheckboxModule, MatFormFieldModule],
  templateUrl: './project-tree-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './project-tree-settings.component.scss',
})
export class ProjectTreeSettingsComponent {
  private readonly settingsService = inject(SettingsService);

  get confirmElementMoves(): boolean {
    return this.settingsService.getSetting<boolean>(
      'confirmElementMoves',
      false
    );
  }

  setConfirmElementMoves(value: boolean): void {
    this.settingsService.setSetting<boolean>(
      'confirmElementMoves',
      typeof value === 'boolean' ? value : false
    );
  }

  get showBreadcrumbs(): boolean {
    return this.settingsService.showBreadcrumbs();
  }

  setShowBreadcrumbs(value: boolean): void {
    this.settingsService.setShowBreadcrumbs(
      typeof value === 'boolean' && value
    );
  }
}
