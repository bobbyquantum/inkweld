import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * A reusable "glass" surface card.
 *
 * Renders a translucent, blurred panel with a themed border and an optional
 * title row. It's designed to sit over a per-surface background so the image /
 * gradient / colour shows through while the content stays readable. Used by the
 * worldbuilding editor (appearance panel + form sections) and project settings.
 */
@Component({
  selector: 'app-glass-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './glass-card.component.html',
  styleUrl: './glass-card.component.scss',
  host: {
    '[attr.data-transparent]': "transparent() ? 'true' : null",
  },
})
export class GlassCardComponent {
  /** Optional icon shown before the title (a Material icon name). */
  icon = input<string>();
  /** Optional title shown in the card header. */
  title = input<string>();
  /** Set to true to omit the default surface tint and stay fully transparent. */
  transparent = input<boolean>(false);
}
