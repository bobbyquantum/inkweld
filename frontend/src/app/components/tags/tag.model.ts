/**
 * Tag System Models
 *
 * Tags can be applied to any element (worldbuilding or documents).
 * They're stored centrally in the project elements Yjs document.
 */

/**
 * Definition of a tag type (stored in project library)
 */
export interface TagDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Material icon name */
  icon: string;
  /** Color for display (CSS color value or material palette) */
  color: string;
  /** Optional description */
  description?: string;
}

/**
 * Assignment of a tag to an element (stored in project elements doc)
 */
export interface ElementTag {
  /** Unique ID of this tag assignment */
  id: string;
  /** The element that has this tag */
  elementId: string;
  /** The tag definition ID */
  tagId: string;
  /** When the tag was added */
  createdAt: string;
}

/**
 * View model for displaying tags with their definitions resolved
 */
export interface ResolvedTag {
  /** The element-tag assignment */
  assignment: ElementTag;
  /** The full tag definition */
  definition: TagDefinition;
}

/**
 * Tag index entry showing count of elements with a tag
 */
export interface TagIndexEntry {
  /** The tag definition */
  definition: TagDefinition;
  /** Number of elements with this tag */
  count: number;
  /** IDs of elements with this tag */
  elementIds: string[];
}

/**
 * Complete tag view for an element
 */
export interface ElementTagView {
  /** Element ID */
  elementId: string;
  /** All tags on this element */
  tags: ResolvedTag[];
}
