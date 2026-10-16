import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';
import { WebMcpService } from '@services/webmcp/webmcp.service';

/**
 * The user's "No AI / Allow AI" choice (`SettingsService.aiAllowed`) as a
 * two-segment toggle. "No AI" is the default: every AI feature in Inkweld is
 * opt-in, and the choice can turn AI off even where the admin has it on.
 *
 * `pill` draws it in the theme selector's frosted pill, at the same height,
 * for /setup. `onlyWithWebMcp` hides it unless the browser offers WebMCP:
 * before any server is chosen, the browser's agent is the only AI there is
 * to allow.
 */
@Component({
  selector: 'app-ai-preference',
  imports: [
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './ai-preference.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ai-preference.component.scss',
})
export class AiPreferenceComponent {
  private readonly settings = inject(SettingsService);
  private readonly webMcp = inject(WebMcpService);

  readonly pill = input(false);
  readonly onlyWithWebMcp = input(false);

  protected readonly allowed = this.settings.aiAllowed;
  protected readonly visible = computed(
    () => !this.onlyWithWebMcp() || this.webMcp.supported()
  );

  constructor() {
    // The API can appear after startup (an extension, an origin-trial token).
    this.webMcp.refreshSupport();
  }

  choose(value: unknown): void {
    this.settings.setAiAllowed(value === 'allow');
  }
}
