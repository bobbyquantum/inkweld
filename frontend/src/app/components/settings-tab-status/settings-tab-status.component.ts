import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Shared loading / error status block reused across settings sub-tabs
 * (Relationships, Templates, etc.).
 */
@Component({
  selector: 'app-settings-tab-status',
  templateUrl: './settings-tab-status.component.html',
  styleUrls: ['./settings-tab-status.component.scss'],
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
})
export class SettingsTabStatusComponent {
  isLoading = input<boolean>(false);
  error = input<string | null>(null);
  retry = output<void>();
}
