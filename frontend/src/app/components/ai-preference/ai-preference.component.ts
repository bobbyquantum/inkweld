import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiPreferenceInfoDialogComponent } from '@dialogs/ai-preference-info-dialog/ai-preference-info-dialog.component';
import { TooltipAriaLabelDirective } from '@directives/tooltip-aria-label.directive';
import { TranslocoModule } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';

export type AiChoice = 'none' | 'allow';

let nextGroupId = 0;

interface AiOption {
  value: AiChoice;
  icon: string;
  label: string;
}

/**
 * The user's "No AI / Allow AI" choice (`SettingsService.aiAllowed`) as an
 * M3 connected button group (styled native radios), with a help button that
 * explains what each option turns on. "No AI" is the default: every AI
 * feature in Inkweld is opt-in, and the choice can turn AI off even where the
 * admin has it on.
 *
 * `pill` draws it in the theme selector's frosted pill, at the same height,
 * for /setup.
 */
@Component({
  selector: 'app-ai-preference',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatRippleModule,
    MatTooltipModule,
    TooltipAriaLabelDirective,
    TranslocoModule,
  ],
  templateUrl: './ai-preference.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ai-preference.component.scss',
})
export class AiPreferenceComponent {
  private readonly settings = inject(SettingsService);
  private readonly dialog = inject(MatDialog);

  readonly pill = input(false);

  /** Native radios, so arrow keys and screen readers work as for any group. */
  protected readonly groupName = `ai-preference-${nextGroupId++}`;

  protected readonly options: readonly AiOption[] = [
    { value: 'none', icon: 'block', label: 'settings.generalTab.aiNone' },
    {
      value: 'allow',
      icon: 'auto_awesome',
      label: 'settings.generalTab.aiAllow',
    },
  ];

  protected readonly selected = computed<AiChoice>(() =>
    this.settings.aiAllowed() ? 'allow' : 'none'
  );

  choose(value: AiChoice): void {
    this.settings.setAiAllowed(value === 'allow');
  }

  openInfo(): void {
    this.dialog.open(AiPreferenceInfoDialogComponent, {
      width: '520px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'dialog',
    });
  }
}
