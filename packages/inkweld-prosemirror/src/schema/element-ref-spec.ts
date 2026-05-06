/**
 * Element Reference node specification.
 *
 * Inline atomic node embedding a stable reference to another element
 * (item, worldbuilding entry, folder, etc.) from the same project.
 *
 * The DOM serialization stays identical to the legacy frontend implementation
 * so existing documents remain parseable. CSS for the rendered chip lives in
 * the frontend (`@components/element-ref/element-ref-styles.ts`) — this
 * package is framework- and DOM-agnostic and ships no styles.
 */

import { type Node, type NodeSpec } from 'prosemirror-model';

/**
 * Permitted element types on an element_ref are represented as plain `string`
 * to keep the shared package decoupled from the OpenAPI client's `ElementType`
 * enum. Consumers (e.g. the frontend) can narrow further if they want.
 */

export interface ElementRefNodeAttrs {
  /** Referenced element's ID. `null` = deleted/orphaned reference. */
  elementId: string | null;
  /** Element type (folder, item, worldbuilding, …). Used for styling. */
  elementType: string | null;
  /** Display text shown in the editor (acts like hyperlink text). */
  displayText: string;
  /** Original element name at insertion time, for rename detection. */
  originalName: string;
  /** Optional relationship row backing this reference. */
  relationshipId: string | null;
  /** Relationship type id (default: `referenced-in`). */
  relationshipTypeId: string;
  /** Optional inline note shown as a tooltip. */
  relationshipNote: string | null;
}

export const ELEMENT_REF_NODE_NAME = 'elementRef';

export const elementRefNodeSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,

  attrs: {
    elementId: { default: null },
    elementType: { default: null },
    displayText: { default: '' },
    originalName: { default: '' },
    relationshipId: { default: null },
    relationshipTypeId: { default: 'referenced-in' },
    relationshipNote: { default: null },
  },

  parseDOM: [
    {
      tag: 'span[data-element-ref]',
      getAttrs(dom: HTMLElement): ElementRefNodeAttrs {
        return {
          elementId: dom.dataset['elementId'] || null,
          elementType: dom.dataset['elementType'] || null,
          displayText: dom.textContent || '',
          originalName: dom.dataset['originalName'] || '',
          relationshipId: dom.dataset['relationshipId'] || null,
          relationshipTypeId:
            dom.dataset['relationshipType'] || 'referenced-in',
          relationshipNote: dom.dataset['relationshipNote'] || null,
        };
      },
    },
  ],

  toDOM(node: Node) {
    const attrs = node.attrs as ElementRefNodeAttrs;
    const elementType = (attrs.elementType ?? 'unknown').toLowerCase();
    const isDeleted = !attrs.elementId;
    const hasNote = !!attrs.relationshipNote;

    const classes = [
      'element-ref',
      `element-ref--${elementType}`,
      isDeleted ? 'element-ref--deleted' : '',
      hasNote ? 'element-ref--has-note' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const tooltipParts: string[] = [];
    if (attrs.displayText) tooltipParts.push(attrs.displayText);
    if (attrs.elementType) tooltipParts.push(`(${attrs.elementType})`);
    if (attrs.relationshipNote) tooltipParts.push(`— ${attrs.relationshipNote}`);
    const tooltipText = tooltipParts.join(' ') || 'Element reference';

    const domAttrs: Record<string, string> = {
      'data-element-ref': 'true',
      'data-element-id': attrs.elementId || '',
      'data-element-type': attrs.elementType || '',
      'data-original-name': attrs.originalName || '',
      'data-relationship-type': attrs.relationshipTypeId || 'referenced-in',
      class: classes,
      contenteditable: 'false',
      'aria-label': tooltipText,
      role: 'link',
      tabindex: '0',
    };

    if (attrs.relationshipId) {
      domAttrs['data-relationship-id'] = attrs.relationshipId;
    }
    if (attrs.relationshipNote) {
      domAttrs['data-relationship-note'] = attrs.relationshipNote;
    }

    return ['span', domAttrs, attrs.displayText || '???'];
  },
};

export const elementRefSchemaExtension = {
  nodes: {
    [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec,
  },
};
