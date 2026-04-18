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
import type { TimeSystem } from '@models/time-system';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';

import { TimeSystemEditPageComponent } from '../../../../time-system-edit-page/time-system-edit-page.component';

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
  template: `
    @if (editingState().mode === 'edit') {
      <app-time-system-edit-page
        [systemId]="editingSystemId()"
        (done)="onEditorDone()" />
    } @else {
      <div class="header">
        <h2>Time Systems</h2>
        <p class="hint">
          Calendars used by this project's timelines. Add a template or design
          your own.
        </p>
      </div>

      <div class="actions">
        <button
          mat-stroked-button
          [matMenuTriggerFor]="templateMenu"
          data-testid="time-systems-install-template">
          <mat-icon>library_add</mat-icon>
          Install template
        </button>
        <mat-menu #templateMenu>
          @for (tpl of availableTemplates(); track tpl.id) {
            <button
              mat-menu-item
              (click)="onInstallTemplate(tpl.id)"
              [attr.data-testid]="'time-systems-template-' + tpl.id">
              {{ tpl.name }}
            </button>
          }
          @if (availableTemplates().length === 0) {
            <div class="empty-menu">All templates installed</div>
          }
        </mat-menu>

        <button
          mat-flat-button
          color="primary"
          (click)="onDesignNew()"
          data-testid="time-systems-design-new">
          <mat-icon>tune</mat-icon>
          Design custom system
        </button>
      </div>

      @if (systems().length === 0) {
        <div class="empty" data-testid="time-systems-empty">
          <mat-icon>schedule</mat-icon>
          <p>No time systems installed.</p>
          <p class="hint">
            Install a template above or design a custom calendar to start
            building timelines.
          </p>
        </div>
      } @else {
        <div class="systems-list" data-testid="time-systems-list">
          @for (system of systems(); track system.id) {
            <div
              class="system-row"
              [attr.data-testid]="'time-systems-row-' + system.id">
              <div class="system-info">
                <div class="system-name">{{ system.name }}</div>
                <div class="system-meta">
                  {{ describeSystem(system) }}
                </div>
              </div>
              <div class="system-actions">
                <button
                  mat-icon-button
                  matTooltip="Edit"
                  (click)="onEdit(system)"
                  [attr.data-testid]="'time-systems-edit-' + system.id">
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  matTooltip="Remove"
                  (click)="onRemove(system)"
                  [attr.data-testid]="'time-systems-remove-' + system.id">
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 8px 4px;
      }
      .header h2 {
        margin: 0 0 4px;
      }
      .hint {
        color: var(--sys-on-surface-variant);
        margin: 0 0 16px;
        font-size: 0.9rem;
      }
      .actions {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .systems-list {
        border: 1px solid var(--sys-outline-variant);
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .system-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
      }
      .system-row + .system-row {
        border-top: 1px solid var(--sys-outline-variant);
      }
      .system-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .system-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }
      .system-name {
        font-weight: 500;
      }
      .system-meta {
        color: var(--sys-on-surface-variant);
        font-size: 0.85rem;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 32px;
        border: 1px dashed var(--sys-outline-variant);
        border-radius: 8px;
        text-align: center;
      }
      .empty-menu {
        padding: 8px 16px;
        color: var(--sys-on-surface-variant);
      }
    `,
  ],
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
