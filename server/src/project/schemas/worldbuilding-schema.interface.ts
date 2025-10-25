/**
 * Worldbuilding element schema definitions
 * These define the structure of forms for worldbuilding elements
 */

/**
 * Field types supported in worldbuilding forms
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

/**
 * Layout options for fields
 */
export interface FieldLayout {
  /** Column span (1-12, for grid layout) */
  span?: number;
  /** Order within the tab */
  order?: number;
}

/**
 * Validation rules for a field
 */
export interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  custom?: string; // Custom validation expression
}

/**
 * Field definition for a worldbuilding element
 */
export interface FieldSchema {
  /** Unique key for the field within the schema */
  key: string;
  /** Display label */
  label: string;
  /** Field type */
  type: FieldType;
  /** Placeholder text */
  placeholder?: string;
  /** Help text / description */
  description?: string;
  /** Default value */
  defaultValue?: unknown;
  /** Options for select/multiselect */
  options?: string[] | { value: string; label: string }[];
  /** Validation rules */
  validation?: FieldValidation;
  /** Layout configuration */
  layout?: FieldLayout;
  /** Number of rows for textarea */
  rows?: number;
  /** Icon to display with field */
  icon?: string;
  /** Whether this field is a nested object */
  isNested?: boolean;
  /** Nested fields (for grouped fields) */
  nestedFields?: FieldSchema[];
}

/**
 * Tab definition for organizing fields
 */
export interface TabSchema {
  /** Unique key for the tab */
  key: string;
  /** Display label */
  label: string;
  /** Icon for the tab */
  icon?: string;
  /** Order in which tabs appear */
  order?: number;
  /** Fields within this tab */
  fields: FieldSchema[];
}

/**
 * Complete schema for a worldbuilding element type
 */
export interface ElementTypeSchema {
  /** Unique identifier for this schema */
  id: string;
  /** Element type this schema is for */
  type: string;
  /** Display name */
  name: string;
  /** Icon for this element type */
  icon: string;
  /** Description of this element type */
  description: string;
  /** Schema version */
  version: number;
  /** Tabs organizing the fields */
  tabs: TabSchema[];
  /** Default values for the element */
  defaultValues?: Record<string, unknown>;
  /** When this schema was created */
  createdAt?: string;
  /** When this schema was last modified */
  updatedAt?: string;
  /** Whether this is a built-in schema */
  isBuiltIn?: boolean;
}

/**
 * Project schema library - collection of all schemas in a project
 */
export interface ProjectSchemaLibrary {
  /** Project identifier */
  projectId: string;
  /** All element type schemas in this project */
  schemas: Record<string, ElementTypeSchema>;
  /** When the library was created */
  createdAt: string;
  /** When the library was last updated */
  updatedAt: string;
}
