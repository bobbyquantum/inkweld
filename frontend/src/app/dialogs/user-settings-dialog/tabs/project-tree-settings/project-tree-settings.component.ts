import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';

@Component({
  selector: 'app-project-tree-settings',
  imports: [MatSlideToggleModule, MatFormFieldModule, TranslocoModule],
  templateUrl: './project-tree-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './project-tree-settings.component.scss',
})
export class ProjectTreeSettingsComponent {
  private readonly settingsService = inject(SettingsService);

  get confirmElementMoves(): boolean {
    return this.settingsService.getSetting<boolean>(
      'confirmElementMoves',
      true
    );
  }

  setConfirmElementMoves(value: boolean): void {
    if (typeof value === 'boolean') {
      this.settingsService.setSetting<boolean>('confirmElementMoves', value);
    } else {
      this.settingsService.setSetting<boolean>('confirmElementMoves', true);
    }
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
