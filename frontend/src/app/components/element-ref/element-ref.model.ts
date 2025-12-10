/**
 * Element Reference & Relationship System - Core Models
 *
 * This module defines the data structures for the element reference system,
 * which enables cross-referencing between documents and worldbuilding elements
 * with typed, bidirectional relationships.
 */

import { ElementType } from '../../../api-client';

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Categories & Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Built-in relationship categories for organizing relationship types
 */
export enum RelationshipCategory {
  /** Simple document mention / reference */
  Reference = 'reference',
  /** Family relationships (parent, child, sibling, spouse) */
  Familial = 'familial',
  /** Social relationships (friend, rival, ally) */
  Social = 'social',
  /** Work/professional relationships (employer, colleague, mentor) */
  Professional = 'professional',
  /** Location-based relationships (lives in, located at) */
  Spatial = 'spatial',
  /** Timeline/causation relationships (happened before, caused) */
  Temporal = 'temporal',
  /** Ownership/possession relationships */
  Ownership = 'ownership',
  /** User-defined custom relationship type */
  Custom = 'custom',
}

/**
 * A relationship type definition (can be built-in or user-created)
 *
 * Relationship types define the vocabulary for connecting elements.
 * Each type has a forward label (e.g., "Parent of") and optionally
 * an inverse label (e.g., "Child of") for displaying backlinks.
 *
 * @deprecated Use RelationshipTypeDefinition instead
 */
export interface RelationshipType {
  /** Unique identifier for this relationship type */
  id: string;
  /** Category for grouping in UI */
  category: RelationshipCategory;
  /** Forward label: "Parent of", "Works for", etc. */
  label: string;
  /** Inverse label for backlinks: "Child of", "Employer of", etc. */
  inverseLabel?: string;
  /** Material icon name for visual identification */
  icon?: string;
  /** Whether this is a built-in type (cannot be deleted) */
  isBuiltIn: boolean;
  /** Optional color for visual distinction (hex code) */
  color?: string;
  /** Whether this relationship is symmetric (same in both directions) */
  isSymmetric?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// New Relationship Type System (v2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for one endpoint of a relationship type.
 * Defines schema constraints and cardinality limits.
 */
export interface RelationshipEndpoint {
  /**
   * Element schemas allowed at this endpoint.
   * Empty array means any schema is allowed.
   * Uses schema type IDs (e.g., 'CHARACTER', 'LOCATION', 'CUSTOM_MY_TYPE')
   */
  allowedSchemas: string[];

  /**
   * Maximum number of relationships of this type allowed at this endpoint.
   * - null/undefined = unlimited
   * - 1 = only one relationship allowed (e.g., "one mother")
   * - n = up to n relationships allowed
   *
   * @example
   * // Mother relationship: target can have max 1 mother
   * targetEndpoint: { maxCount: 1 }
   * // Children: source can have unlimited children
   * sourceEndpoint: { maxCount: null }
   */
  maxCount?: number | null;
}

/**
 * Enhanced relationship type definition with endpoint constraints.
 *
 * This replaces the older RelationshipType interface, providing:
 * - Schema constraints at each endpoint
 * - Cardinality limits (maxCount)
 * - Control over backlink visibility (showInverse)
 *
 * Relationships are stored as directed edges in a project-level graph.
 * The source creates the relationship, the target sees it as a backlink.
 *
 * @example
 * // Brother relationship - typically hide inverse, user adds Sister from other side
 * {
 *   id: 'brother',
 *   name: 'Brother',
 *   inverseLabel: 'Brother of',
 *   showInverse: false,
 *   category: RelationshipCategory.Familial,
 *   isBuiltIn: true,
 *   sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
 *   targetEndpoint: { allowedSchemas: ['CHARACTER'] },
 * }
 */
export interface RelationshipTypeDefinition {
  /** Unique identifier for this relationship type */
  id: string;

  /**
   * Primary label for this relationship type.
   * Shown when viewing outgoing relationships.
   * @example "Brother", "Parent", "Located In", "Owns"
   */
  name: string;

  /**
   * Label shown in backlinks (when target views their incoming relationships).
   * @example "Brother of", "Child of", "Contains", "Owned by"
   */
  inverseLabel: string;

  /**
   * Whether to show this relationship in the target's backlinks panel.
   * Set to false for gendered relationships where users define both directions manually.
   * @default true
   */
  showInverse: boolean;

  /** Category for grouping in UI */
  category: RelationshipCategory;

  /** Material icon name for visual identification */
  icon?: string;

  /** Whether this is a built-in type (cannot be deleted by user) */
  isBuiltIn: boolean;

  /** Optional color for visual distinction (hex code) */
  color?: string;

  /**
   * Source endpoint configuration.
   * The source is the element that creates/owns the relationship.
   */
  sourceEndpoint: RelationshipEndpoint;

  /**
   * Target endpoint configuration.
   * The target is the element being referenced/linked to.
   */
  targetEndpoint: RelationshipEndpoint;

  /** ISO timestamp of creation */
  createdAt?: string;

  /** ISO timestamp of last update */
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Relationships
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An actual relationship instance between two elements
 *
 * Represents a directed edge in the relationship graph from
 * sourceElementId to targetElementId with a specific type.
 */
export interface ElementRelationship {
  /** Unique identifier for this relationship instance */
  id: string;
  /** The element this relationship originates FROM */
  sourceElementId: string;
  /** The element this relationship points TO */
  targetElementId: string;
  /** Reference to the RelationshipType.id */
  relationshipTypeId: string;
  /** Optional free-text note about this specific relationship */
  note?: string;
  /** Override display text when shown inline (like hyperlink text) */
  displayText?: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;

  /**
   * Context for relationships created from document references.
   * Present when this relationship was created by inserting an @ reference.
   */
  documentContext?: DocumentReferenceContext;
}

/**
 * Context for a relationship that originated from a document reference
 */
export interface DocumentReferenceContext {
  /** The document ID where this reference appears */
  documentId: string;
  /** Full document identifier (username:slug:elementId format) */
  fullDocumentId?: string;
  /** Approximate character position in the document (for navigation) */
  position?: number;
  /** Snippet of surrounding text for context */
  contextSnippet?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Views & Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete view of an element's relationships (both directions)
 */
export interface ElementRelationshipView {
  /** Relationships this element defines (pointing outward) */
  outgoing: ElementRelationship[];
  /** Relationships pointing TO this element (backlinks) */
  incoming: ElementRelationship[];
}

/**
 * A relationship with resolved element metadata for display
 */
export interface ResolvedRelationship extends ElementRelationship {
  /** The resolved target element (for outgoing) or source element (for incoming) */
  relatedElement: {
    id: string;
    name: string;
    type: ElementType;
    icon?: string;
  };
  /** The resolved relationship type */
  relationshipType: RelationshipType;
  /** Whether this is an incoming (backlink) relationship */
  isIncoming: boolean;
  /** The label to display (forward or inverse depending on direction) */
  displayLabel: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProseMirror Node Attributes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attributes stored in the ProseMirror elementRef node
 */
export interface ElementRefNodeAttrs {
  /** The target element's ID */
  elementId: string;
  /** The target element's type */
  elementType: ElementType;
  /** Text displayed in the editor */
  displayText: string;
  /** Original element name (for detecting renames) */
  originalName: string;
  /** ID of the relationship record (if one exists) */
  relationshipId?: string;
  /** Relationship type ID for quick styling */
  relationshipTypeId: string;
  /** Inline note (shown as tooltip) */
  relationshipNote?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search & Selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result item from element search (for @ popup)
 */
export interface ElementSearchResult {
  /** The element data */
  element: {
    id: string;
    name: string;
    type: ElementType;
  };
  /** Icon to display (from element metadata or type default) */
  icon: string;
  /** Breadcrumb path: "Parent Folder / Element Name" */
  path: string;
  /** Match score for sorting (higher = better match) */
  score: number;
}

/**
 * Options for the element reference popup
 */
export interface ElementRefPopupOptions {
  /** Screen coordinates for popup positioning */
  position: { x: number; y: number };
  /** Initial search query (characters typed after @) */
  initialQuery?: string;
  /** Filter to specific element types */
  allowedTypes?: ElementType[];
  /** Whether to show relationship type selector */
  showRelationshipSelector?: boolean;
  /** Default relationship type when inserting */
  defaultRelationshipType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Types (Yjs Document Structure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structure of the __relationships__ map in an element's Y.Doc
 */
export interface ElementRelationshipsYjsData {
  /** Relationships where this element is the source */
  outgoing: ElementRelationship[];
}

/**
 * Structure of the project-level relationship type library
 * Stored in the project's schema library Y.Doc alongside schemas
 */
export interface ProjectRelationshipTypes {
  /**
   * Custom relationship types defined for this project.
   * These supplement the built-in default types.
   */
  types: RelationshipTypeDefinition[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event emitted when a reference is inserted via the @ popup
 */
export interface ElementRefInsertEvent {
  /** The element being referenced */
  targetElementId: string;
  targetElementType: ElementType;
  targetElementName: string;
  /** Display text for the reference */
  displayText: string;
  /** Relationship type to use */
  relationshipTypeId: string;
  /** Optional note */
  note?: string;
}

/**
 * Event emitted when a reference node is clicked
 */
export interface ElementRefClickEvent {
  /** The element being referenced */
  elementId: string;
  elementType: ElementType;
  /** Current display text */
  displayText: string;
  /** Original element name */
  originalName: string;
  /** The relationship (if one exists) */
  relationshipId?: string;
  /** Position of the node in the document */
  nodePos: number;
  /** Mouse event for positioning context menus */
  mouseEvent: MouseEvent;
  /** Whether this was a right-click (context menu) */
  isContextMenu: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of validating whether a relationship can be created
 */
export interface RelationshipValidationResult {
  /** Whether the relationship can be created */
  valid: boolean;
  /** Error messages if not valid */
  errors: string[];
}

/**
 * Minimal element info needed for relationship validation
 */
export interface RelationshipValidationElement {
  id: string;
  type: string; // ElementType or custom schema type
}
