import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DocumentBreadcrumbsComponent } from '@components/document-breadcrumbs/document-breadcrumbs.component';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { SyncQueueService } from '@services/sync/sync-queue.service';

@Component({
  selector: 'app-document-tab',
  templateUrl: './document-tab.component.html',
  styleUrls: ['./document-tab.component.scss'],
  imports: [
    DocumentElementEditorComponent,
    DocumentBreadcrumbsComponent,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
})
export class DocumentTabComponent {
  protected readonly settingsService = inject(SettingsService);
  protected readonly projectState = inject(ProjectStateService);
  private readonly syncQueueService = inject(SyncQueueService);

  /**
   * Whether the current document is unavailable (remote element that hasn't synced).
   * When true, a warning is shown instead of the editor.
   */
  protected readonly documentUnavailable = signal(false);

  /** Whether a sync is currently in progress triggered from this component. */
  protected readonly syncing = signal(false);

  /** Error message from the last sync attempt, if any. */
  protected readonly syncError = signal<string | null>(null);

  private availabilityCheckToken = 0;

  // Computed signal that gets the document ID from the active tab
  protected readonly fullDocumentId = computed(() => {
    const tabs = this.projectState.openTabs();
    const selectedIndex = this.projectState.selectedTabIndex();

    // selectedTabIndex directly indexes into openTabs (home is at index 0)
    if (selectedIndex >= 0 && selectedIndex < tabs.length) {
      const tab = tabs[selectedIndex];
      if (tab?.element?.id) {
        const project = this.projectState.project();
        if (project?.username && project?.slug) {
          // Return the properly formatted ID: username:slug:elementId
          return `${project.username}:${project.slug}:${tab.element.id}`;
        }
      }
    }

    return '';
  });

  /** Bare element id of the currently-active document tab. */
  protected readonly bareElementId = computed(() => {
    const tabs = this.projectState.openTabs();
    const selectedIndex = this.projectState.selectedTabIndex();
    if (selectedIndex >= 0 && selectedIndex < tabs.length) {
      return tabs[selectedIndex]?.element?.id ?? '';
    }
    return '';
  });

  constructor() {
    // Check document availability when the active tab changes
    effect(() => {
      const tabs = this.projectState.openTabs();
      const selectedIndex = this.projectState.selectedTabIndex();

      let elementId = '';
      if (selectedIndex >= 0 && selectedIndex < tabs.length) {
        const tab = tabs[selectedIndex];
        elementId = tab?.element?.id ?? '';
      }

      const token = ++this.availabilityCheckToken;

      // Reset unavailable state while checking
      this.documentUnavailable.set(false);

      if (elementId) {
        void this.checkAvailability(elementId, token);
      }
    });
  }

  private async checkAvailability(
    elementId: string,
    token: number
  ): Promise<void> {
    const unavailable =
      await this.projectState.isDocumentUnavailable(elementId);
    if (token !== this.availabilityCheckToken) return;
    this.documentUnavailable.set(unavailable);
  }

  /**
   * Trigger a sync for the current project, then re-check document availability.
   */
  protected async triggerSync(): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    this.syncing.set(true);
    this.syncError.set(null);

    try {
      await this.syncQueueService.syncAllProjects([project]);

      // Re-check availability after sync
      const elementId = this.bareElementId();
      if (elementId) {
        const token = ++this.availabilityCheckToken;
        await this.checkAvailability(elementId, token);
      }

      if (this.documentUnavailable()) {
        this.syncError.set('Document still unavailable after sync. Try again.');
      }
    } catch {
      this.syncError.set('Sync failed. Check your connection and try again.');
    } finally {
      this.syncing.set(false);
    }
  }

  /**
   * Check if tabs are enabled in desktop mode
   */
  protected useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }
}
