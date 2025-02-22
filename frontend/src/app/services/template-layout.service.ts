import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import {
  TemplateField,
  TemplateLayout,
  TemplateSection,
} from '../models/template.model';

@Injectable({
  providedIn: 'root',
})
export class TemplateLayoutService {
  /**
   * Observable for the currently active layout
   */
  readonly activeLayout$: Observable<TemplateLayout | null>;

  private activeLayoutSubject = new BehaviorSubject<TemplateLayout | null>(
    null
  );
  private readonly defaultGap = '1rem';
  private readonly defaultColumns = 12;

  constructor() {
    this.activeLayout$ = this.activeLayoutSubject.asObservable();
  }

  /**
   * Sets the active layout configuration
   */
  setLayout(layout: TemplateLayout): void {
    this.validateLayout(layout);
    this.activeLayoutSubject.next(layout);
  }

  /**
   * Creates a new section in the layout
   */
  createSection(
    name: string,
    layout: {
      type: 'grid' | 'flex' | 'flow';
      columns?: number;
      gap?: string;
      styles?: Record<string, unknown>;
    }
  ): TemplateSection {
    return {
      id: this.generateId(),
      name,
      fields: [],
      layout: {
        type: layout.type,
        columns: layout.columns || this.defaultColumns,
        gap: layout.gap || this.defaultGap,
        styles: layout.styles || {},
      },
    };
  }

  /**
   * Adds a field to a section
   */
  addField(
    section: TemplateSection,
    field: Omit<TemplateField, 'id'>
  ): TemplateField {
    const newField: TemplateField = {
      id: this.generateId(),
      ...field,
    };
    section.fields.push(newField);
    return newField;
  }

  /**
   * Updates a field in a section
   */
  updateField(
    section: TemplateSection,
    fieldId: string,
    updates: Partial<TemplateField>
  ): TemplateField {
    const fieldIndex = section.fields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) {
      throw new Error(`Field ${fieldId} not found in section ${section.id}`);
    }

    const updatedField = {
      ...section.fields[fieldIndex],
      ...updates,
    };

    section.fields[fieldIndex] = updatedField;
    return updatedField;
  }

  /**
   * Removes a field from a section
   */
  removeField(section: TemplateSection, fieldId: string): void {
    const fieldIndex = section.fields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) {
      throw new Error(`Field ${fieldId} not found in section ${section.id}`);
    }

    section.fields.splice(fieldIndex, 1);
  }

  /**
   * Updates section layout configuration
   */
  updateSectionLayout(
    section: TemplateSection,
    updates: Partial<TemplateSection['layout']>
  ): void {
    section.layout = {
      ...section.layout,
      ...updates,
    };
  }

  /**
   * Gets computed styles for a section based on its layout configuration
   */
  getComputedSectionStyles(section: TemplateSection): Record<string, string> {
    const styles: Record<string, string> = {};

    switch (section.layout.type) {
      case 'grid':
        styles['display'] = 'grid';
        styles['gridTemplateColumns'] = this.generateGridTemplate(section);
        styles['gap'] = section.layout.gap || this.defaultGap;
        break;
      case 'flex':
        styles['display'] = 'flex';
        styles['flexWrap'] = 'wrap';
        styles['gap'] = section.layout.gap || this.defaultGap;
        break;
      case 'flow':
        styles['display'] = 'block';
        break;
    }

    // Apply custom styles
    if (section.layout.styles) {
      Object.entries(section.layout.styles).forEach(([key, value]) => {
        styles[key] = String(value);
      });
    }

    return styles;
  }

  /**
   * Gets computed styles for a field based on its configuration
   */
  getComputedFieldStyles(field: TemplateField): Record<string, string> {
    const styles: Record<string, string> = {};

    // Apply custom styles
    if (field.styles) {
      Object.entries(field.styles).forEach(([key, value]) => {
        styles[key] = String(value);
      });
    }

    return styles;
  }

  /**
   * Generates CSS grid template columns based on section configuration
   */
  private generateGridTemplate(section: TemplateSection): string {
    if (section.layout.type !== 'grid') {
      return '';
    }

    const columns = section.layout.columns || this.defaultColumns;
    return `repeat(${columns}, 1fr)`;
  }

  /**
   * Validates a layout configuration
   */
  private validateLayout(layout: TemplateLayout): void {
    if (!layout.sections) {
      throw new Error('Layout must have sections array');
    }

    for (const section of layout.sections) {
      this.validateSection(section);
    }
  }

  /**
   * Validates a section configuration
   */
  private validateSection(section: TemplateSection): void {
    if (!section.id) {
      throw new Error('Section must have an id');
    }

    if (!section.name) {
      throw new Error('Section must have a name');
    }

    if (!section.layout) {
      throw new Error('Section must have a layout configuration');
    }

    if (!['grid', 'flex', 'flow'].includes(section.layout.type)) {
      throw new Error(`Invalid layout type: ${section.layout.type}`);
    }

    if (section.layout.columns && section.layout.columns < 1) {
      throw new Error('Grid columns must be greater than 0');
    }

    for (const field of section.fields) {
      this.validateField(field);
    }
  }

  /**
   * Validates a field configuration
   */
  private validateField(field: TemplateField): void {
    if (!field.id) {
      throw new Error('Field must have an id');
    }

    if (!field.name) {
      throw new Error('Field must have a name');
    }

    if (!field.type) {
      throw new Error('Field must have a type');
    }

    if (
      field.viewMode &&
      !['edit', 'readonly', 'hidden'].includes(field.viewMode)
    ) {
      throw new Error(`Invalid view mode: ${field.viewMode}`);
    }
  }

  /**
   * Generates a unique ID for sections and fields
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
