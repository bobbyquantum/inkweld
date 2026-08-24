/**
 * Schema type definitions for worldbuilding elements
 * Shared between services and components
 */

import type { ElementAppearance } from '@models/element-appearance';

export enum FieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  ARRAY = 'array',
  CHECKBOX = 'checkbox',
  RELATIONSHIP = 'relationship',
}

export interface FieldLayout {
  span?: number;
  order?: number;
}

export interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  custom?: string;
}

export interface FieldSchema {
  id?: string;
  key: string;
  label: string;
  type: FieldType | string;
  placeholder?: string;
  description?: string;
  defaultValue?: unknown;
  options?: string[] | { value: string; label: string }[];
  validation?: FieldValidation;
  layout?: FieldLayout;
  rows?: number;
  icon?: string;
  isNested?: boolean;
  nestedFields?: FieldSchema[];
  /** Relationship fields only: schema id the linked element must belong to (empty/undefined = any worldbuilding element) */
  targetSchemaId?: string;
  /** Relationship fields only: allow multiple linked elements */
  multiple?: boolean;
  /** Relationship fields only: label shown for the inverse (backlink) direction */
  inverseLabel?: string;
  /** Relationship fields only: id of the auto-managed relationship type backing this field */
  relationshipTypeId?: string;
}

export interface TabSchema {
  key: string;
  label: string;
  icon?: string;
  order?: number;
  fields: FieldSchema[];
}

export interface ElementTypeSchema {
  /** Unique identifier (nanoid) - used for all lookups */
  id: string;
  /** Display name shown to users */
  name: string;
  /** Material icon name */
  icon: string;
  /** Description of what this schema is for */
  description: string;
  /** Schema version for migrations */
  version: number;
  /** Tab definitions containing field schemas */
  tabs: TabSchema[];
  /** Default values for new elements */
  defaultValues?: Record<string, unknown>;
  /** Default appearance (menu/content backgrounds) applied to new elements of this type. */
  defaultAppearance?: ElementAppearance;
  /** Default identity image (media:// reference or URL) for new elements of this type. */
  defaultImage?: string;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
  /**
   * True for a brand-new template that has not yet been saved to the schema
   * library. Used to preserve unsaved new-template tabs across a reload while
   * still dropping tabs whose template was deleted.
   */
  isNew?: boolean;
}
