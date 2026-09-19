import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { type Generator } from '@models/generator';
import { GeneratorLibraryService } from '@services/generator/generator-library.service';
import { type RollResult } from '@utils/generator-engine';

/** How many candidates a single menu shows. */
const SUGGESTION_COUNT = 8;

/**
 * Dice button that offers generated text for a field.
 *
 * Rolling opens a menu of candidates rather than writing straight into the
 * field: the caller only receives a value the user actually picked, so no
 * typed-in text is ever silently overwritten, and browsing several options
 * (the point of a name generator) costs no extra clicks.
 *
 * With `generatorId` bound to an existing generator the menu rolls that one
 * directly. Without it — an unbound field in a project that has generators —
 * the menu lists the generators and rolls the one the user hovers.
 *
 * The button renders nothing at all when the project has no generators.
 */
@Component({
  selector: 'app-generator-dice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './generator-dice.component.html',
  styleUrls: ['./generator-dice.component.scss'],
})
export class GeneratorDiceComponent {
  private readonly library = inject(GeneratorLibraryService);

  /** Generator to roll. Unknown or absent ids fall back to the picker menu. */
  readonly generatorId = input<string | undefined>(undefined);

  /** Results to reject, e.g. names already used in the project. */
  readonly exclude = input<readonly string[]>([]);

  /** Test id for the trigger button. */
  readonly testId = input('generator-dice');

  /** Emitted with the candidate the user picked. */
  readonly picked = output<string>();

  /** Candidates currently shown in the open menu. */
  protected readonly suggestions = signal<RollResult[]>([]);

  /** The generator whose candidates are on screen. */
  protected readonly rolledGenerator = signal<Generator | null>(null);

  protected readonly generators = this.library.generators;

  /** The generator this dice is bound to, if it still exists. */
  protected readonly boundGenerator = computed(() =>
    this.library.findGenerator(this.generatorId())
  );

  /** Hidden entirely when there is nothing this button could roll. */
  protected readonly visible = computed(
    () => this.boundGenerator() !== undefined || this.library.hasGenerators()
  );

  /** Rolls a fresh set of candidates for the bound generator. */
  protected onMenuOpened(): void {
    const generator = this.boundGenerator();
    if (generator) this.rollFor(generator);
  }

  /** Rolls a fresh set of candidates for `generator` (picker submenus). */
  protected rollFor(generator: Generator): void {
    this.rolledGenerator.set(generator);
    this.suggestions.set(
      this.library.roll(generator.id, {
        count: SUGGESTION_COUNT,
        unique: true,
        exclude: this.exclude(),
      })
    );
  }

  /** Re-rolls the candidates currently on screen, leaving the menu open. */
  protected onReroll(event: Event): void {
    // Not a `mat-menu-item`, but the menu still closes on any click that
    // reaches its panel, and re-rolling is only useful in place.
    event.stopPropagation();
    const generator = this.rolledGenerator();
    if (generator) this.rollFor(generator);
  }

  protected onPick(text: string): void {
    this.picked.emit(text);
  }
}
