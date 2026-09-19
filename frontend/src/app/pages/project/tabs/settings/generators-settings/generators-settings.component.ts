import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GeneratorEditPageComponent } from '@components/generator-edit/generator-edit-page.component';
import { TranslocoModule } from '@jsverse/transloco';
import { type Generator } from '@models/generator';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { GeneratorLibraryService } from '@services/generator/generator-library.service';
import { rollGenerator } from '@utils/generator-engine';

/**
 * Editing mode: either the list, or the inline editor. `generatorId` is
 * `null` for "create new" and a string for "edit existing".
 */
type EditingState =
  { mode: 'list' } | { mode: 'edit'; generatorId: string | null };

/**
 * Generators Settings Section
 *
 * Lists the random generators defined in the current project. Users can
 * create, edit and delete them, and see a sample roll for each.
 *
 * Generators are scoped per-project and persisted in the project's Yjs
 * document alongside schemas and time systems. Worldbuilding templates can
 * reference a generator by id for their name field, so deleting one in use
 * simply removes that template's dice button.
 */
@Component({
  selector: 'app-generators-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeneratorEditPageComponent,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './generators-settings.component.html',
  styleUrls: ['./generators-settings.component.scss'],
})
export class GeneratorsSettingsComponent {
  private readonly library = inject(GeneratorLibraryService);
  private readonly dialogs = inject(DialogGatewayService);

  protected readonly editingState = signal<EditingState>({ mode: 'list' });

  protected readonly editingGeneratorId = computed(() => {
    const state = this.editingState();
    return state.mode === 'edit' ? state.generatorId : null;
  });

  protected readonly generators = this.library.generators;

  /**
   * One sample per generator, for the list rows. Seeded by the generator's
   * own id so the sample only changes when the generator does — a sample
   * that reshuffled on every change detection run would be unreadable.
   */
  protected readonly samples = computed(() => {
    const samples = new Map<string, string>();
    for (const generator of this.generators()) {
      const [result] = rollGenerator(generator, {
        seed: seedFromId(generator.id),
      });
      samples.set(generator.id, result?.text ?? '');
    }
    return samples;
  });

  protected sampleFor(generator: Generator): string {
    return this.samples().get(generator.id) ?? '';
  }

  protected onCreate(): void {
    this.editingState.set({ mode: 'edit', generatorId: null });
  }

  protected onEdit(generator: Generator): void {
    this.editingState.set({ mode: 'edit', generatorId: generator.id });
  }

  protected onEditorDone(): void {
    this.editingState.set({ mode: 'list' });
  }

  protected onRemove(generator: Generator): void {
    void this.confirmAndRemove(generator);
  }

  private async confirmAndRemove(generator: Generator): Promise<void> {
    const ok = await this.dialogs.openConfirmationDialog({
      title: 'Remove generator',
      message: `Remove generator "${generator.name}"?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    this.library.removeGenerator(generator.id);
  }
}

/** Stable 32-bit seed derived from a generator id. */
function seedFromId(id: string): number {
  let hash = 5381;
  for (const character of id) {
    hash = Math.trunc((hash << 5) + hash + character.codePointAt(0)!);
  }
  return hash >>> 0;
}
