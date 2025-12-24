/**
 * Schema type definitions for worldbuilding elements
 * Shared between services and components
 */

export enum FieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  ARRAY = 'array',
  CHECKBOX = 'checkbox',
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
  /** Whether this is a built-in schema (cannot be deleted) */
  isBuiltIn: boolean;
  /** Tab definitions containing field schemas */
  tabs: TabSchema[];
  /** Default values for new elements */
  defaultValues?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}
