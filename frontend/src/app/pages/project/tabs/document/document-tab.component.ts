import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';

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

    // selectedTabIndex is 1-based (0 = home), so subtract 1 to get array index
    const tabArrayIndex = selectedIndex - 1;

    if (tabArrayIndex >= 0 && tabArrayIndex < tabs.length) {
      const tab = tabs[tabArrayIndex];
      if (tab?.element) {
        const project = this.projectState.project();
        if (project) {
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




