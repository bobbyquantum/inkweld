import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ProjectStateService } from '@services/project-state.service';

@Component({
  selector: 'app-mobile-side-menu',
  templateUrl: './mobile-side-menu.component.html',
  styleUrls: ['./mobile-side-menu.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
})
export class MobileSideMenuComponent {
  @Output() sidenavToggle = new EventEmitter<void>();
  @Output() exitProject = new EventEmitter<void>();

  protected readonly projectState = inject(ProjectStateService);
  private readonly router = inject(Router);

  /**
   * Set the selected tab index in the project state
   * @param index Tab index to select
   */
  setSelectedTabIndex(index: number): void {
    this.projectState.selectedTabIndex.set(index);
  }

  /**
   * Close a tab and handle navigation to previous tab if needed
   * @param index Tab index to close
   * @param event Mouse event, used to prevent propagation
   */
  closeTab(index: number, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // Don't close the home tab
    if (index === 0) return;
    // If closing the current tab, navigate to the previous tab first
    if (this.projectState.selectedTabIndex() === index) {
      const newIndex = Math.max(0, index - 1);
      this.setSelectedTabIndex(newIndex);
    }
    // Close the tab in the state service
    this.projectState.closeTab(index - 1);
  }

  /**
   * Toggle sidenav and handle tab selection with navigation in one step
   * @param index Tab index to select
   */
  selectTabAndToggle(index: number): void {
    this.setSelectedTabIndex(index);
    this.navigateToTab(index);
    this.sidenavToggle.emit();
  }

  /**
   * Navigate to the selected tab
   * @param index Tab index to navigate to
   */
  private navigateToTab(index: number): void {
    const project = this.projectState.project();
    if (!project) return;

    // Navigate based on the tab index
    if (index === 0) {
      // Home tab
      void this.router.navigate(['/', project.username, project.slug]);
    } else {
      // Get tab info
      const tabs = this.projectState.openTabs();
      if (index > 0 && tabs.length >= index) {
        const tab = tabs[index - 1]; // -1 to account for home tab

        // Handle different tab types
        if (tab.type === 'system') {
          // System tab (documents list or project files)
          void this.router.navigate([
            '/',
            project.username,
            project.slug,
            tab.systemType, // 'documents-list' or 'project-files'
          ]);
        } else {
          // Document or folder tab
          void this.router.navigate([
            '/',
            project.username,
            project.slug,
            tab.type, // 'document' or 'folder'
            tab.id,
          ]);
        }
      }
    }
  }

  /**
   * Trigger exit project action
   */
  onExitProject(): void {
    this.exitProject.emit();
  }
}
