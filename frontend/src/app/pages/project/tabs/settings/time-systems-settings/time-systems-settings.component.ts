import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TimeSystemEditPageComponent } from '@components/time-system-edit/time-system-edit-page.component';
import type { TimeSystem } from '@models/time-system';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';

/**
 * Time-system editing mode: either showing the list, or an inline editor.
 * `systemId` is `null` for "design new" and a string for "edit existing".
 */
type EditingState =
  | { mode: 'list' }
  | { mode: 'edit'; systemId: string | null };

/**
 * Time Systems Settings Section
 *
 * Lists time systems installed in the current project. Users can:
 * - Install a seed template (Gregorian, Stardate, fantasy calendars, …)
 * - Design a custom calendar from scratch
 * - Edit or delete installed systems
 *
 * Systems are scoped per-project and persisted in the project's Yjs
 * document alongside schemas and relationships. Timeline elements reference
 * systems by ID, so removing a system that is in use will leave events
 * rendered as "unknown system" until a replacement is installed.
 */
@Component({
  selector: 'app-time-systems-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TimeSystemEditPageComponent,
  ],
  templateUrl: './time-systems-settings.component.html',
  styleUrls: ['./time-systems-settings.component.scss'],
})
export class TimeSystemsSettingsComponent {
  private readonly library = inject(TimeSystemLibraryService);
  private readonly dialogs = inject(DialogGatewayService);

  /** Controls whether we show the list or the inline editor. */
  protected readonly editingState = signal<EditingState>({ mode: 'list' });

  /** Convenience signal: the systemId when in edit mode, else null. */
  protected readonly editingSystemId = computed(() => {
    const state = this.editingState();
    return state.mode === 'edit' ? state.systemId : null;
  });

  protected readonly systems = this.library.systems;

  protected readonly availableTemplates = computed(() => {
    const installed = new Set(this.systems().map(s => s.id));
    return this.library.templates.filter(t => !installed.has(t.id));
  });

  protected describeSystem(system: TimeSystem): string {
    const units = system.unitLabels.join(' / ');
    const subs =
      system.subdivisions.length > 0
        ? ` · [${system.subdivisions.join(', ')}]`
        : '';
    return `${units}${subs}`;
  }

  protected onInstallTemplate(id: string): void {
    this.library.installTemplate(id);
  }

  protected onDesignNew(): void {
    this.editingState.set({ mode: 'edit', systemId: null });
  }

  protected onEdit(system: TimeSystem): void {
    this.editingState.set({ mode: 'edit', systemId: system.id });
  }

  protected onEditorDone(): void {
    this.editingState.set({ mode: 'list' });
  }

  protected onRemove(system: TimeSystem): void {
    void this.confirmAndRemove(system);
  }

  private async confirmAndRemove(system: TimeSystem): Promise<void> {
    const ok = await this.dialogs.openConfirmationDialog({
      title: 'Remove time system',
      message: `Remove time system "${system.name}"?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    this.library.removeSystem(system.id);
  }
}
