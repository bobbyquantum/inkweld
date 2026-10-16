import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';
import { WebMcpService } from '@services/webmcp/webmcp.service';

/**
 * A compact "let browser AI agents use Inkweld" switch for pages shown before
 * the user reaches Settings, such as /setup. It only appears in browsers that
 * offer WebMCP, and it is off until the user turns it on: like every AI
 * feature in Inkweld, it is opt-in.
 */
@Component({
  selector: 'app-webmcp-opt-in',
  imports: [
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './webmcp-opt-in.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './webmcp-opt-in.component.scss',
})
export class WebMcpOptInComponent {
  private readonly settings = inject(SettingsService);
  protected readonly webMcp = inject(WebMcpService);
  protected readonly enabled = this.settings.webMcpEnabled;

  setEnabled(value: boolean): void {
    this.settings.setWebMcpEnabled(value);
  }
}
