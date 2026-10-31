import type { Injector } from '@angular/core';
import { type Element, ElementType, type Project } from '@inkweld/index';
import {
  getDocumentFormat,
  getDocumentRole,
  SCENE_METADATA_KEYS,
} from '@models/scene-metadata';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { ToolError } from './tool';

/** Element types as the tools name them (the stored enum values). */
export const ELEMENT_TYPES: readonly ElementType[] = [
  ElementType.Folder,
  ElementType.Item,
  ElementType.Worldbuilding,
  ElementType.RelationshipChart,
  ElementType.Canvas,
  ElementType.Timeline,
];

export const ELEMENT_TYPE_HELP =
  'FOLDER (a folder), ITEM (a prose document: chapter, scene, note or conversation), WORLDBUILDING (a character, location or other entry built from a template), RELATIONSHIP_CHART, CANVAS (a drawing or map), TIMELINE.';

/** A compact, agent-friendly view of a tree element. */
export interface ElementSummary {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  depth: number;
  /** Folder path above the element, e.g. "Part One / Chapter Two". */
  path: string;
  schemaId?: string;
  /** Documents only: "scene" or "note". */
  role?: string;
  /** Documents only: "conversation" when not prose. */
  format?: string;
  /** Scenes only: idea, draft, revised or final. */
  status?: string;
  synopsis?: string;
  pinned?: boolean;
}

/**
 * Access to the project that is open in this tab. Every project tool goes
 * through it, so "no project open" and "read-only access" produce the same
 * messages everywhere.
 */
export class ProjectToolContext {
  constructor(readonly injector: Injector) {}

  get state(): ProjectStateService {
    return this.injector.get(ProjectStateService);
  }

  project(): Project {
    const project = this.state.project();
    if (!project?.username || !project.slug) {
      throw new ToolError(
        'No project is open. Call list_projects, then open_project.'
      );
    }
    return project;
  }

  elements(): Element[] {
    return this.state.elements();
  }

  element(elementId: string): Element {
    const element = this.elements().find(e => e.id === elementId);
    if (!element) {
      throw new ToolError(
        `No element with id "${elementId}" in this project. Use get_project_tree or search_elements to find ids.`
      );
    }
    return element;
  }

  /** An element that must be a prose document. */
  document(elementId: string): Element {
    const element = this.element(elementId);
    if (element.type !== ElementType.Item) {
      throw new ToolError(
        `"${element.name}" is a ${element.type}, not a document (ITEM). Only documents have prose content.`
      );
    }
    return element;
  }

  /** An element that must be a worldbuilding entry. */
  worldbuilding(elementId: string): Element {
    const element = this.element(elementId);
    if (element.type !== ElementType.Worldbuilding) {
      throw new ToolError(
        `"${element.name}" is a ${element.type}, not a WORLDBUILDING element.`
      );
    }
    return element;
  }

  /** An element that must be a canvas. */
  canvas(elementId: string): Element {
    const element = this.element(elementId);
    if (element.type !== ElementType.Canvas) {
      throw new ToolError(
        `"${element.name}" is a ${element.type}, not a CANVAS element.`
      );
    }
    return element;
  }

  requireWrite(): void {
    this.project();
    if (!this.state.canWrite()) {
      throw new ToolError('You only have read access to this project.');
    }
  }

  /** The bare Yjs document id of a prose document. */
  documentId(elementId: string): string {
    const { username, slug } = this.project();
    return `${username}:${slug}:${elementId}`;
  }

  summarize(element: Element): ElementSummary {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === element.id);
    const ancestors =
      index >= 0
        ? this.injector
            .get(ElementTreeService)
            .getAncestors(elements, index)
            .map(a => a.name)
            .reverse()
        : [];
    const summary: ElementSummary = {
      id: element.id,
      name: element.name,
      type: element.type,
      parentId: element.parentId ?? null,
      depth: element.level,
      path: ancestors.join(' / '),
    };
    if (element.schemaId) summary.schemaId = element.schemaId;
    if (element.type === ElementType.Item) {
      const role = getDocumentRole(element.metadata);
      if (role) summary.role = role;
      if (getDocumentFormat(element.metadata) === 'conversation') {
        summary.format = 'conversation';
      }
      const status = element.metadata?.[SCENE_METADATA_KEYS.status];
      if (status) summary.status = status;
      const synopsis = element.metadata?.[SCENE_METADATA_KEYS.synopsis];
      if (synopsis) summary.synopsis = synopsis;
    }
    if (this.state.isPinned(element.id)) summary.pinned = true;
    return summary;
  }
}
