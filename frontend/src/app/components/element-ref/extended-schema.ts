/**
 * Extended ProseMirror Schema for Inkweld
 *
 * Extends ngx-editor's default schema with custom nodes like elementRef
 * for inline element references (@ mentions).
 */
import {
  marks,
  nodes,
  schema as ngxEditorSchema,
} from '@bobbyquantum/ngx-editor/schema';
import { Schema } from 'prosemirror-model';

import { elementRefNodeSpec } from './element-ref-schema';

/**
 * Creates an extended schema that includes ngx-editor's nodes and marks
 * plus custom Inkweld nodes like elementRef.
 *
 * @returns A new Schema with all standard nodes/marks plus elementRef
 */
export function createExtendedSchema(): Schema {
  // Start with ngx-editor's nodes and add our custom ones
  const extendedNodes = {
    ...nodes,
    elementRef: elementRefNodeSpec,
  };

  // Use the same marks as ngx-editor
  return new Schema({
    nodes: extendedNodes,
    marks: marks,
  });
}

/**
 * The extended schema instance for use throughout the application.
 * This should be used instead of ngx-editor's default schema when
 * element references are needed.
 */
export const extendedSchema = createExtendedSchema();

/**
 * Re-export the original schema for cases where extensions aren't needed
 */
export { ngxEditorSchema };
