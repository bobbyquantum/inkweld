import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SettingsService } from '@services/settings.service';

@Component({
  selector: 'app-project-tree-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCheckboxModule, MatFormFieldModule],
  templateUrl: './project-tree-settings.component.html',
  styleUrl: './project-tree-settings.component.scss',
})
export class ProjectTreeSettingsComponent {
  private settingsService = inject(SettingsService);

  get confirmElementMoves(): boolean {
    return this.settingsService.getSetting<boolean>(
      'confirmElementMoves',
      false
    );
  }

  set confirmElementMoves(value: boolean) {
    if (typeof value === 'boolean') {
      this.settingsService.setSetting<boolean>('confirmElementMoves', value);
    } else {
      this.settingsService.setSetting<boolean>('confirmElementMoves', false);
    }
  }
}
