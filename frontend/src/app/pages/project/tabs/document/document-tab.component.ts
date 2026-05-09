import { Component, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DocumentBreadcrumbsComponent } from '@components/document-breadcrumbs/document-breadcrumbs.component';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { DocumentSyncService } from '@services/sync/document-sync.service';

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
  providers: [DocumentSyncService],
})
export class DocumentTabComponent {
  protected readonly settingsService = inject(SettingsService);
  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentSync = inject(DocumentSyncService);

  // Expose sync state signals for the template
  protected readonly documentUnavailable =
    this.documentSync.documentUnavailable;
  protected readonly syncing = this.documentSync.syncing;
  protected readonly syncError = this.documentSync.syncError;

  // Computed signal that gets the document ID from the active tab
  protected readonly fullDocumentId = computed(() => {
    const tabs = this.projectState.openTabs();
    const selectedIndex = this.projectState.selectedTabIndex();

    if (selectedIndex >= 0 && selectedIndex < tabs.length) {
      const tab = tabs[selectedIndex];
      if (tab?.element?.id) {
        const project = this.projectState.project();
        if (project?.username && project?.slug) {
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

  /**
   * Whether the breadcrumb bar is currently visible above the editor.
   * Mirrors the visibility logic in DocumentBreadcrumbsComponent so that
   * the editor's fixed height can be compensated accordingly.
   */
  protected readonly breadcrumbVisible = computed(() => {
    const elementId = this.bareElementId();
    if (!elementId || !this.settingsService.showBreadcrumbs()) return false;
    const elements = this.projectState.elements();
    const el = elements.find(e => e.id === elementId);
    if (!el) return false;
    // Breadcrumb only shows when the element has a parent (not top-level)
    return !!el.parentId;
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

      void this.documentSync.checkAvailability(elementId);
    });
  }

  protected async triggerSync(): Promise<void> {
    await this.documentSync.triggerSync(this.bareElementId());
  }

  /**
   * Check if tabs are enabled in desktop mode
   */
  protected useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }
}
