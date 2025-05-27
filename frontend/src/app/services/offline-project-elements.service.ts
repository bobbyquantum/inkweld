import { Injectable, signal } from '@angular/core';
import { ProjectElementDto } from '@inkweld/index';
import { nanoid } from 'nanoid';

const OFFLINE_ELEMENTS_STORAGE_KEY = 'inkweld-offline-elements';

interface StoredProjectElements {
  [projectKey: string]: ProjectElementDto[];
}

@Injectable({
  providedIn: 'root',
})
export class OfflineProjectElementsService {
  readonly elements = signal<ProjectElementDto[]>([]);
  readonly isLoading = signal(false);

  /**
   * Load elements for a specific project
   */
  loadElements(username: string, slug: string): void {
    this.isLoading.set(true);
    try {
      const projectKey = `${username}:${slug}`;
      const storedElements = this.getStoredElements();
      const elements = storedElements[projectKey] || [];
      this.elements.set(elements);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Save elements for a specific project
   */
  saveElements(
    username: string,
    slug: string,
    elements: ProjectElementDto[]
  ): void {
    const projectKey = `${username}:${slug}`;
    const storedElements = this.getStoredElements();
    storedElements[projectKey] = elements;
    this.saveStoredElements(storedElements);
    this.elements.set(elements);
  }

  /**
   * Create default project structure
   */
  createDefaultStructure(username: string, slug: string): ProjectElementDto[] {
    const defaultElements: ProjectElementDto[] = [
      {
        id: nanoid(),
        name: 'Chapters',
        type: 'FOLDER',
        level: 0,
        expandable: true,
        position: 0,
        version: 0,
        metadata: {},
      },
      {
        id: nanoid(),
        name: 'Chapter 1',
        type: 'ITEM',
        level: 1,
        expandable: false,
        position: 1,
        version: 0,
        metadata: {},
      },
      {
        id: nanoid(),
        name: 'Notes',
        type: 'FOLDER',
        level: 0,
        expandable: true,
        position: 2,
        version: 0,
        metadata: {},
      },
      {
        id: nanoid(),
        name: 'Research',
        type: 'ITEM',
        level: 1,
        expandable: false,
        position: 3,
        version: 0,
        metadata: {},
      },
    ];

    this.saveElements(username, slug, defaultElements);
    return defaultElements;
  }

  /**
   * Update elements
   */
  updateElements(
    username: string,
    slug: string,
    elements: ProjectElementDto[]
  ): void {
    this.saveElements(username, slug, elements);
  }

  /**
   * Add element
   */
  addElement(
    username: string,
    slug: string,
    type: ProjectElementDto['type'],
    name: string,
    parentId?: string
  ): ProjectElementDto[] {
    const elements = this.elements();
    const parentIndex = parentId
      ? elements.findIndex(e => e.id === parentId)
      : -1;
    const parentLevel = parentIndex >= 0 ? elements[parentIndex].level : -1;

    const newElement: ProjectElementDto = {
      id: nanoid(),
      name,
      type,
      level: parentLevel + 1,
      expandable: type === 'FOLDER',
      position: elements.length,
      version: 0,
      metadata: {},
    };

    const newElements = [...elements];
    newElements.splice(parentIndex + 1, 0, newElement);
    const recomputedElements = this.recomputePositions(newElements);

    this.saveElements(username, slug, recomputedElements);
    return recomputedElements;
  }

  /**
   * Delete element
   */
  deleteElement(
    username: string,
    slug: string,
    elementId: string
  ): ProjectElementDto[] {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === elementId);
    if (index === -1) return elements;

    const subtree = this.getSubtree(elements, index);
    const newElements = elements.filter(e => !subtree.includes(e));
    const recomputedElements = this.recomputePositions(newElements);

    this.saveElements(username, slug, recomputedElements);
    return recomputedElements;
  }

  /**
   * Move element
   */
  moveElement(
    username: string,
    slug: string,
    elementId: string,
    targetIndex: number,
    newLevel: number
  ): ProjectElementDto[] {
    const elements = this.elements();
    const elementIndex = elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return elements;

    const element = elements[elementIndex];
    const subtree = this.getSubtree(elements, elementIndex);
    const levelDiff = newLevel - element.level;

    // Remove subtree from current position
    const newElements = elements.filter(e => !subtree.includes(e));

    // Update levels in subtree
    subtree.forEach(e => (e.level += levelDiff));

    // Insert at new position
    newElements.splice(targetIndex, 0, ...subtree);
    const recomputedElements = this.recomputePositions(newElements);

    this.saveElements(username, slug, recomputedElements);
    return recomputedElements;
  }

  /**
   * Rename element
   */
  renameElement(
    username: string,
    slug: string,
    elementId: string,
    newName: string
  ): ProjectElementDto[] {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === elementId);
    if (index === -1) return elements;

    const newElements = [...elements];
    newElements[index] = { ...newElements[index], name: newName };

    this.saveElements(username, slug, newElements);
    return newElements;
  }

  private getStoredElements(): StoredProjectElements {
    try {
      const stored = localStorage.getItem(OFFLINE_ELEMENTS_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as StoredProjectElements) : {};
    } catch (error) {
      console.error('Failed to load offline elements:', error);
      return {};
    }
  }

  private saveStoredElements(elements: StoredProjectElements): void {
    try {
      localStorage.setItem(
        OFFLINE_ELEMENTS_STORAGE_KEY,
        JSON.stringify(elements)
      );
    } catch (error) {
      console.error('Failed to save offline elements:', error);
      throw error;
    }
  }

  private getSubtree(
    elements: ProjectElementDto[],
    startIndex: number
  ): ProjectElementDto[] {
    const startLevel = elements[startIndex].level;
    const subtree = [elements[startIndex]];

    for (let i = startIndex + 1; i < elements.length; i++) {
      if (elements[i].level > startLevel) {
        subtree.push(elements[i]);
      } else {
        break;
      }
    }

    return subtree;
  }

  private recomputePositions(
    elements: ProjectElementDto[]
  ): ProjectElementDto[] {
    return elements.map((element, index) => ({
      ...element,
      position: index,
    }));
  }
}
