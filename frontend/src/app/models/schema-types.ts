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
  id: string;
  type: string;
  name: string;
  icon: string;
  description: string;
  version: number;
  isBuiltIn: boolean;
  tabs: TabSchema[];
  defaultValues?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
