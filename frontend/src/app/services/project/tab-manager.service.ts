import { inject, Injectable, signal } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import { Subject } from 'rxjs';

import { PublishPlan } from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';

/**
 * Represents a tab in the application interface
 */
export interface AppTab {
  /** Unique identifier for the tab */
  id: string;
  /** Display name for the tab */
  name: string;
  /** Type of tab content */
  type: 'document' | 'folder' | 'system' | 'worldbuilding' | 'publishPlan';
  /** For system tabs, specifies the system view type */
  systemType?:
    | 'documents-list'
    | 'media'
    | 'templates-list'
    | 'relationships-list'
    | 'tags-list'
    | 'settings'
    | 'home';
  /** The element associated with this tab (for document/folder/worldbuilding tabs) */
  element?: Element;
  /** The element type (for filtering/display purposes) */
  elementType?: ElementType;
  /** The publish plan associated with this tab (for publishPlan tabs) */
  publishPlan?: PublishPlan;
}

/**
 * Result of opening a document/tab
 */
export interface OpenTabResult {
  /** The tab that was opened or selected */
  tab: AppTab;
  /** Whether a new tab was created (vs selecting existing) */
  wasCreated: boolean;
  /** The index of the tab in the tabs array */
  index: number;
}

/**
 * Service responsible for managing application tabs.
 *
 * This service handles:
 * - Opening and closing tabs
 * - Tracking open documents
 * - Managing tab selection
 * - Determining tab types based on element types
 *
 * Note: This service manages the tab state but does NOT handle persistence.
 * Tab persistence (saving/restoring from cache) is handled by the caller.
 */
@Injectable({
  providedIn: 'root',
})
export class TabManagerService {
  private logger = inject(LoggerService);

  // State signals
  readonly openTabs = signal<AppTab[]>([]);
  readonly openDocuments = signal<Element[]>([]);
  readonly selectedTabIndex = signal<number>(0);

  /**
   * Emits the tab that was just closed.
   * Used by AutoSnapshotService to create snapshots when document tabs are closed.
   */
  readonly tabClosed$ = new Subject<AppTab>();

  /**
   * Determines the tab type based on the element type.
   *
   * @param elementType - The type of the element
   * @returns The appropriate tab type
   */
  getTabTypeForElement(
    elementType: ElementType | string
  ): 'document' | 'folder' | 'worldbuilding' {
    const typeStr = String(elementType);

    if (typeStr === String(ElementType.Folder)) {
      return 'folder';
    } else if (typeStr === String(ElementType.Item)) {
      return 'document';
    } else {
      // All other types (built-in worldbuilding or custom templates) are worldbuilding
      return 'worldbuilding';
    }
  }

  /**
   * Opens a document/element as a tab.
   *
   * If a tab for this element already exists, it will be selected.
   * Otherwise, a new tab will be created.
   *
   * @param element - The element to open
   * @returns Information about the opened tab
   */
  openDocument(element: Element): OpenTabResult {
    const tabs = this.openTabs();
    const documents = this.openDocuments();

    // Add to open documents if not already there
    if (!documents.some(d => d.id === element.id)) {
      this.openDocuments.set([...documents, element]);
    }

    // Determine the tab type
    const tabType = this.getTabTypeForElement(element.type);

    // Check if tab already exists
    const existingIndex = tabs.findIndex(t => t.id === element.id);
    if (existingIndex !== -1) {
      // Tab exists, just select it
      this.selectedTabIndex.set(existingIndex);

      this.logger.debug(
        'TabManager',
        `Selected existing tab "${element.name}" at index ${existingIndex}`
      );

      return {
        tab: tabs[existingIndex],
        wasCreated: false,
        index: existingIndex,
      };
    }

    // Create new tab
    const newTab: AppTab = {
      id: element.id,
      name: element.name,
      type: tabType,
      element: element,
      elementType: element.type,
    };

    const newTabs = [...tabs, newTab];
    this.openTabs.set(newTabs);

    // Select the new tab
    const newIndex = newTabs.length - 1;
    this.selectedTabIndex.set(newIndex);

    this.logger.debug(
      'TabManager',
      `Created new tab for "${element.name}" (type: ${tabType}) at index ${newIndex}`
    );

    return {
      tab: newTab,
      wasCreated: true,
      index: newIndex,
    };
  }

  /**
   * Opens a system tab like documents list, project files, templates, or home.
   *
   * @param type - The type of system tab to open
   * @returns Information about the opened tab
   */
  openSystemTab(
    type:
      | 'documents-list'
      | 'media'
      | 'templates-list'
      | 'relationships-list'
      | 'tags-list'
      | 'settings'
      | 'home'
  ): OpenTabResult {
    const tabs = this.openTabs();
    const tabId = `system-${type}`;
    const tabName =
      type === 'home'
        ? 'Home'
        : type === 'documents-list'
          ? 'Documents'
          : type === 'media'
            ? 'Media'
            : type === 'templates-list'
              ? 'Templates'
              : type === 'tags-list'
                ? 'Tags'
                : type === 'settings'
                  ? 'Settings'
                  : 'Relationships';

    // Check if tab already exists
    const existingIndex = tabs.findIndex(t => t.id === tabId);
    if (existingIndex !== -1) {
      this.selectedTabIndex.set(existingIndex);

      this.logger.debug(
        'TabManager',
        `Selected existing system tab "${tabName}" at index ${existingIndex}`
      );

      return {
        tab: tabs[existingIndex],
        wasCreated: false,
        index: existingIndex,
      };
    }

    // Create new system tab
    const newTab: AppTab = {
      id: tabId,
      name: tabName,
      type: 'system',
      systemType: type,
    };

    const newTabs = [...tabs, newTab];
    this.openTabs.set(newTabs);

    const newIndex = newTabs.length - 1;
    this.selectedTabIndex.set(newIndex);

    this.logger.debug(
      'TabManager',
      `Created system tab "${tabName}" at index ${newIndex}`
    );

    return {
      tab: newTab,
      wasCreated: true,
      index: newIndex,
    };
  }

  /**
   * Opens a publish plan tab for editing.
   *
   * @param plan - The publish plan to open
   * @returns Information about the opened tab
   */
  openPublishPlanTab(plan: PublishPlan): OpenTabResult {
    const tabs = this.openTabs();
    const tabId = `publish-plan-${plan.id}`;

    // Check if tab already exists
    const existingIndex = tabs.findIndex(t => t.id === tabId);
    if (existingIndex !== -1) {
      // Update the plan reference in case it changed
      const updatedTabs = [...tabs];
      updatedTabs[existingIndex] = {
        ...updatedTabs[existingIndex],
        publishPlan: plan,
        name: plan.name,
      };
      this.openTabs.set(updatedTabs);

      this.selectedTabIndex.set(existingIndex);

      this.logger.debug(
        'TabManager',
        `Selected existing publish plan tab "${plan.name}" at index ${existingIndex}`
      );

      return {
        tab: updatedTabs[existingIndex],
        wasCreated: false,
        index: existingIndex,
      };
    }

    // Create new publish plan tab
    const newTab: AppTab = {
      id: tabId,
      name: plan.name,
      type: 'publishPlan',
      publishPlan: plan,
    };

    const newTabs = [...tabs, newTab];
    this.openTabs.set(newTabs);

    const newIndex = newTabs.length - 1;
    this.selectedTabIndex.set(newIndex);

    this.logger.debug(
      'TabManager',
      `Created publish plan tab "${plan.name}" at index ${newIndex}`
    );

    return {
      tab: newTab,
      wasCreated: true,
      index: newIndex,
    };
  }

  /**
   * Closes a tab at the specified index.
   *
   * @param index - The index of the tab to close (0-based, in the tabs array)
   * @returns true if the tab was closed, false if invalid index
   */
  closeTab(index: number): boolean {
    const tabs = this.openTabs();
    const closedTab = tabs[index];

    if (!closedTab) {
      this.logger.error(
        'TabManager',
        `Attempted to close invalid tab at index ${index}`
      );
      return false;
    }

    // Remove from tabs
    const newTabs = [...tabs.slice(0, index), ...tabs.slice(index + 1)];
    this.openTabs.set(newTabs);

    // If it was a document/folder/worldbuilding tab, also remove from openDocuments
    if (closedTab.element) {
      const documents = this.openDocuments();
      const docIndex = documents.findIndex(d => d.id === closedTab.id);
      if (docIndex !== -1) {
        const newDocuments = [
          ...documents.slice(0, docIndex),
          ...documents.slice(docIndex + 1),
        ];
        this.openDocuments.set(newDocuments);
      }
    }

    // Update selected tab index
    const currentSelectedIndex = this.selectedTabIndex();
    if (currentSelectedIndex === index) {
      // If we closed the selected tab, select previous tab or stay at 0
      this.selectedTabIndex.set(Math.max(0, index - 1));
    } else if (currentSelectedIndex > index) {
      // If we closed a tab before the currently selected one, adjust the index
      this.selectedTabIndex.set(currentSelectedIndex - 1);
    }

    this.logger.debug(
      'TabManager',
      `Closed tab "${closedTab.name}" at index ${index}`
    );

    // Notify subscribers (e.g., AutoSnapshotService) that a tab was closed
    this.tabClosed$.next(closedTab);

    return true;
  }

  /**
   * Closes a tab by element ID.
   *
   * @param elementId - The ID of the element whose tab should be closed
   * @returns true if the tab was found and closed, false otherwise
   */
  closeTabByElementId(elementId: string): boolean {
    const tabs = this.openTabs();
    const tabIndex = tabs.findIndex(
      tab => tab.element && tab.element.id === elementId
    );

    if (tabIndex !== -1) {
      return this.closeTab(tabIndex);
    }

    return false;
  }

  /**
   * Closes a tab by tab ID.
   *
   * @param tabId - The ID of the tab to close
   * @returns true if the tab was found and closed, false otherwise
   */
  closeTabById(tabId: string): boolean {
    const tabs = this.openTabs();
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);

    if (tabIndex !== -1) {
      return this.closeTab(tabIndex);
    }

    return false;
  }

  /**
   * Selects a tab by index.
   *
   * @param index - The tab index (including home tab offset, so 0 = home, 1 = first tab)
   */
  selectTab(index: number): void {
    this.selectedTabIndex.set(index);
  }

  /**
   * Gets a tab by element ID.
   *
   * @param elementId - The element ID to find
   * @returns The tab if found, undefined otherwise
   */
  getTabByElementId(elementId: string): AppTab | undefined {
    return this.openTabs().find(tab => tab.id === elementId);
  }

  /**
   * Updates a tab's element reference.
   * Useful when element metadata changes (e.g., icon loaded).
   *
   * @param elementId - The element ID of the tab to update
   * @param element - The updated element
   */
  updateTabElement(elementId: string, element: Element): void {
    const tabs = this.openTabs();
    const tabIndex = tabs.findIndex(t => t.id === elementId);

    if (tabIndex !== -1) {
      const updatedTabs = [...tabs];
      updatedTabs[tabIndex] = {
        ...updatedTabs[tabIndex],
        element: element,
        name: element.name,
      };
      this.openTabs.set(updatedTabs);
    }
  }

  /**
   * Clears all tabs and resets to initial state.
   * Called when switching projects.
   */
  clearAllTabs(): void {
    this.logger.info('TabManager', 'Clearing all tabs');
    this.openTabs.set([]);
    this.openDocuments.set([]);
    this.selectedTabIndex.set(0);
  }

  /**
   * Sets tabs directly (for restoring from cache).
   *
   * @param tabs - The tabs to set
   * @param selectedIndex - The selected tab index (default 0)
   */
  setTabs(tabs: AppTab[], selectedIndex = 0): void {
    this.openTabs.set(tabs);

    // Also update openDocuments for backward compatibility
    const documents = tabs
      .filter(tab => tab.element)
      .map(tab => tab.element as Element);
    this.openDocuments.set(documents);

    this.selectedTabIndex.set(selectedIndex);

    this.logger.debug(
      'TabManager',
      `Set ${tabs.length} tabs, selected index: ${selectedIndex}`
    );
  }

  /**
   * Reorders tabs by moving a tab from one index to another.
   *
   * @param fromIndex - The current index of the tab to move
   * @param toIndex - The target index where the tab should be placed
   */
  reorderTabs(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;

    const tabs = this.openTabs();
    if (fromIndex < 0 || fromIndex >= tabs.length) return;
    if (toIndex < 0 || toIndex >= tabs.length) return;

    const newTabs = [...tabs];
    const [movedTab] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, movedTab);
    this.openTabs.set(newTabs);

    // Update selected index if needed
    const currentSelected = this.selectedTabIndex();
    if (currentSelected === fromIndex) {
      // The moved tab was selected, update to new position
      this.selectedTabIndex.set(toIndex);
    } else if (fromIndex < currentSelected && toIndex >= currentSelected) {
      // Tab moved from before to after selected - shift selected left
      this.selectedTabIndex.set(currentSelected - 1);
    } else if (fromIndex > currentSelected && toIndex <= currentSelected) {
      // Tab moved from after to before selected - shift selected right
      this.selectedTabIndex.set(currentSelected + 1);
    }

    this.logger.debug(
      'TabManager',
      `Reordered tab from index ${fromIndex} to ${toIndex}`
    );
  }

  /**
   * Validates tabs against current elements and removes invalid ones.
   *
   * @param currentElements - The current list of valid elements
   * @param currentPlans - The current list of valid publish plans (optional)
   * @returns The list of valid tabs that were kept
   */
  validateAndFilterTabs(
    currentElements: Element[],
    currentPlans?: PublishPlan[]
  ): AppTab[] {
    const tabs = this.openTabs();

    const validTabs = tabs.filter(tab => {
      // Always keep system tabs
      if (tab.type === 'system') {
        return true;
      }

      // For publish plan tabs, verify the plan still exists
      if (tab.type === 'publishPlan') {
        if (!currentPlans) return true; // If no plans provided, keep the tab
        return (
          tab.publishPlan &&
          currentPlans.some(p => p.id === tab.publishPlan!.id)
        );
      }

      // For document/folder/worldbuilding tabs, verify element exists
      return (
        tab.element && currentElements.some(element => element.id === tab.id)
      );
    });

    if (validTabs.length !== tabs.length) {
      this.openTabs.set(validTabs);

      // Also update openDocuments
      const documents = validTabs
        .filter(tab => tab.element)
        .map(tab => tab.element as Element);
      this.openDocuments.set(documents);

      this.logger.debug(
        'TabManager',
        `Filtered tabs: ${tabs.length} -> ${validTabs.length} valid tabs`
      );
    }

    return validTabs;
  }

  /**
   * Finds the tab index for a given system tab type.
   *
   * @param systemType - The system tab type to find
   * @returns The index (with home offset) or -1 if not found
   */
  findSystemTabIndex(
    systemType:
      | 'documents-list'
      | 'project-files'
      | 'templates-list'
      | 'relationships-list'
      | 'tags-list'
  ): number {
    const tabs = this.openTabs();
    const index = tabs.findIndex(t => t.systemType === systemType);
    return index;
  }

  /**
   * Finds the tab index for a given element ID.
   *
   * @param elementId - The element ID to find
   * @returns The index (with home offset) or -1 if not found
   */
  findTabIndexByElementId(elementId: string): number {
    const tabs = this.openTabs();
    const index = tabs.findIndex(t => t.id === elementId);
    return index;
  }

  /**
   * Finds the tab index for a given publish plan ID.
   *
   * @param planId - The publish plan ID to find
   * @returns The index (with home offset) or -1 if not found
   */
  findPublishPlanTabIndex(planId: string): number {
    const tabs = this.openTabs();
    const index = tabs.findIndex(
      t => t.type === 'publishPlan' && t.publishPlan?.id === planId
    );
    return index;
  }

  /**
   * Gets a publish plan tab by plan ID.
   *
   * @param planId - The publish plan ID to find
   * @returns The tab or undefined if not found
   */
  getTabByPublishPlanId(planId: string): AppTab | undefined {
    const tabs = this.openTabs();
    return tabs.find(
      t => t.type === 'publishPlan' && t.publishPlan?.id === planId
    );
  }

  /**
   * Updates a publish plan tab with new plan data.
   * Useful when plan name or content changes.
   *
   * @param plan - The updated publish plan
   */
  updatePublishPlanTab(plan: PublishPlan): void {
    const tabs = this.openTabs();
    const index = tabs.findIndex(
      t => t.type === 'publishPlan' && t.publishPlan?.id === plan.id
    );

    if (index !== -1) {
      const updatedTabs = [...tabs];
      updatedTabs[index] = {
        ...updatedTabs[index],
        name: plan.name,
        publishPlan: plan,
      };
      this.openTabs.set(updatedTabs);
    }
  }
}
