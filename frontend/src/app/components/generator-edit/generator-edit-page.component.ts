import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import {
  cloneGenerator,
  DEFAULT_GENERATOR_ICON,
  formatEntryLines,
  type Generator,
  GENERATOR_CATEGORIES,
  type GeneratorRule,
  parseEntryLines,
} from '@models/generator';
import { GeneratorLibraryService } from '@services/generator/generator-library.service';
import {
  type GeneratorIssue,
  MODIFIER_NAMES,
  rollGenerator,
  type RollResult,
  validateGenerator,
} from '@utils/generator-engine';

/** How many candidates the live preview shows. */
const PREVIEW_COUNT = 8;

/** A rule as edited: entries are one per line, `text | weight`. */
interface RuleDraft {
  /** Stable identity used for `@for` tracking. */
  _id: number;
  key: string;
  entriesText: string;
}

let nextRuleId = 1;

/**
 * Inline editor for a {@link Generator}.
 *
 * Rendered inside the generators settings section — NOT a routed page. The
 * parent passes an optional `generatorId` (omit for create mode) and listens
 * to `done` to switch back to the list.
 *
 * Rules are edited as plain text, one entry per line, because that is how
 * people already keep name lists; {@link parseEntryLines} turns them into
 * weighted entries on save. The preview re-rolls on every keystroke, which is
 * what makes the `#rule#` syntax discoverable without documentation.
 */
@Component({
  selector: 'app-generator-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './generator-edit-page.component.html',
  styleUrls: ['./generator-edit-page.component.scss'],
})
export class GeneratorEditPageComponent {
  private readonly library = inject(GeneratorLibraryService);

  /** Generator to edit. Absent starts the editor in "create" mode. */
  readonly generatorId = input<string | null>(null);

  /** Emitted when the editor is done (saved or cancelled). */
  readonly done = output<void>();

  protected readonly categories = GENERATOR_CATEGORIES;
  protected readonly modifierNames = MODIFIER_NAMES.join(', ');

  protected readonly isEditMode = computed(() => this.generatorId() !== null);
  protected readonly loadError = signal<string | null>(null);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly category = signal<string>('names');
  protected readonly template = signal('');
  protected readonly rules = signal<RuleDraft[]>([]);

  /** Bumped to re-roll the preview without changing the draft. */
  private readonly previewSeed = signal(1);

  /** The draft as a real generator, for validation and preview. */
  protected readonly draft = computed<Generator>(() => ({
    id: this.generatorId() ?? 'draft',
    name: this.name(),
    icon: DEFAULT_GENERATOR_ICON,
    description: this.description(),
    category: this.category(),
    template: this.template(),
    rules: this.draftRules(),
  }));

  protected readonly issues = computed<GeneratorIssue[]>(() =>
    validateGenerator(this.draft())
  );

  protected readonly errors = computed(() =>
    this.issues().filter(issue => issue.severity === 'error')
  );

  protected readonly warnings = computed(() =>
    this.issues().filter(issue => issue.severity === 'warning')
  );

  protected readonly preview = computed<RollResult[]>(() =>
    rollGenerator(this.draft(), {
      seed: this.previewSeed(),
      count: PREVIEW_COUNT,
      unique: true,
    })
  );

  protected readonly canSave = computed(
    () => this.name().trim().length > 0 && this.errors().length === 0
  );

  /** The id whose contents are already in the draft, so it loads once. */
  private loadedId: string | null | undefined = undefined;

  constructor() {
    effect(() => {
      const id = this.generatorId();
      // `findGenerator` reads the library signal, and the library is shared:
      // tracking it would re-run this effect whenever a collaborator saved
      // any generator, overwriting whatever the user had typed. Only the id
      // is a dependency; the lookup itself runs untracked.
      untracked(() => this.initialiseFor(id));
    });
  }

  // ─── State initialisation ─────────────────────────────────────────────

  /**
   * Fills the draft for `id`, once. A miss is not recorded as loaded, so an
   * editor opened before the project document finished syncing still fills
   * in when the generator arrives — the next change to `generatorId` or a
   * re-entry into the editor retries it.
   */
  private initialiseFor(id: string | null): void {
    if (this.loadedId === id) return;

    if (!id) {
      this.loadedId = id;
      this.initialiseBlank();
      return;
    }

    const generator = this.library.findGenerator(id);
    if (!generator) {
      this.loadError.set(`Generator "${id}" was not found.`);
      return;
    }

    this.loadedId = id;
    this.loadFromLibrary(generator);
  }

  private initialiseBlank(): void {
    this.loadError.set(null);
    this.name.set('');
    this.description.set('');
    this.category.set('names');
    this.template.set('#first# #last#');
    this.rules.set([
      { _id: nextRuleId++, key: 'first', entriesText: '' },
      { _id: nextRuleId++, key: 'last', entriesText: '' },
    ]);
  }

  private loadFromLibrary(stored: Generator): void {
    // Normalised first: a generator from an archive or another client is not
    // shape-checked, and the editor must not throw on a malformed one.
    const generator = cloneGenerator(stored);

    this.loadError.set(null);
    this.name.set(generator.name);
    this.description.set(generator.description);
    this.category.set(generator.category);
    this.template.set(generator.template);
    this.rules.set(
      generator.rules.map(rule => ({
        _id: nextRuleId++,
        key: rule.key,
        entriesText: formatEntryLines(rule.entries),
      }))
    );
  }

  /** The draft rules parsed back into their stored shape. */
  private draftRules(): GeneratorRule[] {
    return this.rules().map(rule => ({
      key: rule.key.trim(),
      entries: parseEntryLines(rule.entriesText),
    }));
  }

  // ─── Rule list operations ─────────────────────────────────────────────

  /** Issues attached to a rule, matched by its (trimmed) key. */
  protected issuesForRule(rule: RuleDraft): GeneratorIssue[] {
    const key = rule.key.trim();
    return this.issues().filter(issue => issue.ruleKey === key);
  }

  /** Issues that belong to the template rather than to any rule. */
  protected templateIssues(): GeneratorIssue[] {
    return this.issues().filter(issue => issue.ruleKey === undefined);
  }

  protected onRuleKeyChange(id: number, key: string): void {
    this.rules.update(list =>
      list.map(rule => (rule._id === id ? { ...rule, key } : rule))
    );
  }

  protected onRuleEntriesChange(id: number, entriesText: string): void {
    this.rules.update(list =>
      list.map(rule => (rule._id === id ? { ...rule, entriesText } : rule))
    );
  }

  protected onAddRule(): void {
    this.rules.update(list => [
      ...list,
      { _id: nextRuleId++, key: '', entriesText: '' },
    ]);
  }

  protected onRemoveRule(id: number): void {
    this.rules.update(list => list.filter(rule => rule._id !== id));
  }

  /** Number of usable entries in a rule, shown beside its key. */
  protected entryCount(rule: RuleDraft): number {
    return parseEntryLines(rule.entriesText).length;
  }

  // ─── Preview ──────────────────────────────────────────────────────────

  protected onReroll(): void {
    this.previewSeed.update(seed => seed + 1);
  }

  // ─── Save / cancel ────────────────────────────────────────────────────

  protected onSave(): void {
    if (!this.canSave()) return;

    const payload = {
      name: this.name().trim(),
      icon: DEFAULT_GENERATOR_ICON,
      description: this.description().trim(),
      category: this.category(),
      template: this.template().trim(),
      rules: this.draftRules(),
    };

    const id = this.generatorId();
    if (id) {
      this.library.updateGenerator(id, payload);
    } else {
      this.library.addGenerator(payload);
    }
    this.done.emit();
  }

  protected onCancel(): void {
    this.done.emit();
  }
}
