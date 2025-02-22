import {
  DOMOutputSpec as ProseMirrorDOMSpec,
  Mark as ProseMirrorMark,
  Node as ProseMirrorNode,
  StyleParseRule,
  TagParseRule,
} from 'prosemirror-model';

/**
 * Represents a template definition that can be applied to documents
 */
export interface Template {
  id: string;
  name: string;
  description?: string;
  schema: TemplateSchema;
  layout: TemplateLayout;
  metadata: TemplateMetadata;
  version: number;
}

/**
 * Schema definition for a template using ProseMirror schema structure
 */
export interface TemplateSchema {
  nodes: Record<string, TemplateNodeSpec>;
  marks?: Record<string, TemplateMarkSpec>;
}

/**
 * Specification for a node in the template schema
 */
export interface TemplateNodeSpec {
  content?: string;
  group?: string;
  inline?: boolean;
  atom?: boolean;
  attrs?: Record<string, TemplateAttributeSpec>;
  selectable?: boolean;
  draggable?: boolean;
  code?: boolean;
  whitespace?: 'pre' | 'normal';
  definingAsContext?: boolean;
  defining?: boolean;
  isolating?: boolean;
  toDOM?: (node: ProseMirrorNode) => ProseMirrorDOMSpec;
  parseDOM?: readonly TagParseRule[];
}

/**
 * Specification for a mark in the template schema
 */
export interface TemplateMarkSpec {
  attrs?: Record<string, TemplateAttributeSpec>;
  inclusive?: boolean;
  excludes?: string;
  group?: string;
  spanning?: boolean;
  toDOM?: (mark: ProseMirrorMark, inline: boolean) => ProseMirrorDOMSpec;
  parseDOM?: readonly (TagParseRule | StyleParseRule)[];
}

/**
 * Specification for an attribute in the template schema
 */
export interface TemplateAttributeSpec {
  default?: unknown;
  required?: boolean;
  validations?: TemplateValidation[];
}

/**
 * Validation rules for template fields
 */
export interface TemplateValidation {
  type: 'required' | 'pattern' | 'min' | 'max' | 'custom';
  value?: unknown;
  message?: string;
  validator?: (value: unknown) => boolean;
}

/**
 * Layout configuration for template sections and fields
 */
export interface TemplateLayout {
  sections: TemplateSection[];
  styles?: Record<string, unknown>;
}

/**
 * Section within a template layout
 */
export interface TemplateSection {
  id: string;
  name: string;
  fields: TemplateField[];
  layout: {
    type: 'grid' | 'flex' | 'flow';
    columns?: number;
    gap?: string;
    styles?: Record<string, unknown>;
  };
}

/**
 * Field configuration within a template section
 */
export interface TemplateField {
  id: string;
  name: string;
  type: string; // References node/mark type from schema
  required?: boolean;
  defaultValue?: unknown;
  viewMode?: 'edit' | 'readonly' | 'hidden';
  styles?: Record<string, unknown>;
}

/**
 * Additional metadata for template management
 */
export interface TemplateMetadata {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  isPublic: boolean;
  tags?: string[];
  category?: string;
  parentTemplate?: string; // For template inheritance
}
