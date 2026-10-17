import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { WebMcpService } from '@services/webmcp/webmcp.service';

/**
 * Explains the "No AI / Allow AI" choice: what stays off, what Allow AI turns
 * on, and whether this browser offers WebMCP.
 */
@Component({
  selector: 'app-ai-preference-info-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslocoModule],
  templateUrl: './ai-preference-info-dialog.component.html',
  styleUrl: './ai-preference-info-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-testid': 'ai-preference-info-dialog' },
})
export class AiPreferenceInfoDialogComponent {
  private readonly webMcp = inject(WebMcpService);

  protected readonly webMcpSupported = this.webMcp.supported;

  constructor() {
    // The API can appear after startup (an extension, an origin-trial token).
    this.webMcp.refreshSupport();
  }
}
