import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';

@Component({
  selector: 'app-document-tab',
  templateUrl: './document-tab.component.html',
  styleUrls: ['./document-tab.component.scss'],
  standalone: true,
  imports: [DocumentElementEditorComponent, MatIconModule],
})
export class DocumentTabComponent {
  protected readonly settingsService = inject(SettingsService);
  protected readonly projectState = inject(ProjectStateService);

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
  /**
   * Check if tabs are enabled in desktop mode
   */
  protected useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }
}
