/**
 * Element Reference Schema Extension
 *
 * Defines the ProseMirror node type for inline element references.
 * This node is used to embed clickable references to other elements
 * within document content.
 */

import { NodeSpec } from 'prosemirror-model';

import { ElementType } from '../../../api-client';
import { ElementRefNodeAttrs } from './element-ref.model';

/**
 * ProseMirror node specification for element references
 *
 * The elementRef node is an inline, atomic node that displays a reference
 * to another element in the project. It stores the element ID for stable
 * references and customizable display text (like a hyperlink).
 */
export const elementRefNodeSpec: NodeSpec = {
  // Node is inline and part of the inline content group
  group: 'inline',
  inline: true,

  // Atomic means it cannot be directly edited - treated as a single unit
  atom: true,

  // Define the attributes stored on this node
  attrs: {
    /** The referenced element's ID */
    elementId: { default: null },
    /** The element's type (for styling) */
    elementType: { default: null },
    /** Display text shown in the editor */
    displayText: { default: '' },
    /** Original element name (for detecting renames) */
    originalName: { default: '' },
    /** Associated relationship record ID */
    relationshipId: { default: null },
    /** Relationship type for quick access */
    relationshipTypeId: { default: 'referenced-in' },
    /** Inline note (shown as tooltip) */
    relationshipNote: { default: null },
  },

  // Define how to parse this node from HTML
  parseDOM: [
    {
      tag: 'span[data-element-ref]',
      getAttrs(dom: HTMLElement): ElementRefNodeAttrs {
        return {
          elementId: dom.getAttribute('data-element-id') || '',
          elementType:
            (dom.getAttribute('data-element-type') as ElementType) || null,
          displayText: dom.textContent || '',
          originalName: dom.getAttribute('data-original-name') || '',
          relationshipId: dom.getAttribute('data-relationship-id') || undefined,
          relationshipTypeId:
            dom.getAttribute('data-relationship-type') || 'referenced-in',
          relationshipNote:
            dom.getAttribute('data-relationship-note') || undefined,
        };
      },
    },
  ],

  // Define how to serialize this node to HTML
  toDOM(node) {
    const attrs = node.attrs as ElementRefNodeAttrs;
    const elementType = attrs.elementType?.toLowerCase() || 'unknown';
    const isDeleted = !attrs.elementId;
    const hasNote = !!attrs.relationshipNote;

    // Build CSS classes
    const classes = [
      'element-ref',
      `element-ref--${elementType}`,
      isDeleted ? 'element-ref--deleted' : '',
      hasNote ? 'element-ref--has-note' : '',
    ]
      .filter(Boolean)
      .join(' ');

    // Build tooltip content
    const tooltipParts: string[] = [];
    if (attrs.displayText) {
      tooltipParts.push(attrs.displayText);
    }
    if (attrs.elementType) {
      tooltipParts.push(`(${attrs.elementType})`);
    }
    if (attrs.relationshipNote) {
      tooltipParts.push(`— ${attrs.relationshipNote}`);
    }
    const tooltipText = tooltipParts.join(' ') || 'Element reference';

    // Build DOM attributes
    const domAttrs: Record<string, string> = {
      'data-element-ref': 'true',
      'data-element-id': attrs.elementId || '',
      'data-element-type': attrs.elementType || '',
      'data-original-name': attrs.originalName || '',
      'data-relationship-type': attrs.relationshipTypeId || 'referenced-in',
      class: classes,
      contenteditable: 'false',
      // Note: Native title attribute removed in favor of rich tooltip component
      'aria-label': tooltipText,
      role: 'link',
      tabindex: '0',
    };

    // Add optional attributes
    if (attrs.relationshipId) {
      domAttrs['data-relationship-id'] = attrs.relationshipId;
    }
    if (attrs.relationshipNote) {
      domAttrs['data-relationship-note'] = attrs.relationshipNote;
    }

    return ['span', domAttrs, attrs.displayText || '???'];
  },
};

/**
 * CSS styles for element reference nodes
 *
 * These styles should be added to the document editor's stylesheet.
 */
export const elementRefStyles = `
  /* Base element reference style */
  .element-ref {
    display: inline;
    padding: 2px 6px;
    border-radius: 4px;
    background: linear-gradient(135deg, var(--sys-primary-container, #e8def8) 0%, var(--element-ref-bg-end, #d4c8f0) 100%);
    color: var(--sys-on-primary-container, #21005d);
    text-decoration: none;
    cursor: pointer;
    font-weight: 500;
    white-space: nowrap;
    transition: all 0.2s ease;
    border: 1px solid var(--sys-outline-variant, rgba(121, 116, 126, 0.3));
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    position: relative;
  }

  .element-ref:hover {
    background: linear-gradient(135deg, var(--sys-primary, #6750a4) 0%, var(--sys-primary-dark, #523d8a) 100%);
    color: var(--sys-on-primary, #ffffff);
    box-shadow: 0 2px 6px rgba(103, 80, 164, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    border-color: var(--sys-primary, #6750a4);
    transform: translateY(-1px);
  }

  .element-ref:focus {
    outline: 2px solid var(--sys-primary, #6750a4);
    outline-offset: 2px;
  }

  /* Icon before the text */
  .element-ref::before {
    font-family: 'Material Icons';
    font-size: 14px;
    margin-right: 3px;
    vertical-align: middle;
    opacity: 0.85;
  }

  /* Type-specific styling */
  .element-ref--item::before {
    content: 'description';
  }

  .element-ref--worldbuilding::before {
    content: 'category';
  }

  .element-ref--folder::before {
    content: 'folder';
  }

  .element-ref:hover {
    background: linear-gradient(135deg, var(--sys-primary, #6750a4) 0%, #5a4590 100%);
    color: var(--sys-on-primary, #ffffff);
    box-shadow: 0 2px 6px rgba(103, 80, 164, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    border-color: var(--sys-primary, #6750a4);
    transform: translateY(-1px);
  }

  /* Deleted element style */
  .element-ref--deleted {
    background: linear-gradient(135deg, var(--sys-error-container, #f9dedc) 0%, #f0c8c8 100%);
    color: var(--sys-on-error-container, #410e0b);
    text-decoration: line-through;
    opacity: 0.7;
    border-color: var(--sys-error, rgba(179, 38, 30, 0.3));
  }

  .element-ref--deleted:hover {
    background: linear-gradient(135deg, var(--sys-error, #b3261e) 0%, #9a1f18 100%);
    color: var(--sys-on-error, #ffffff);
    border-color: var(--sys-error, #b3261e);
    opacity: 1;
  }

  /* Note indicator */
  .element-ref--has-note::after {
    content: '';
    position: absolute;
    top: -2px;
    right: -2px;
    width: 6px;
    height: 6px;
    background: var(--sys-tertiary, #7d5260);
    border-radius: 50%;
    border: 1px solid var(--sys-surface, #fff);
  }

  /* Dark theme adjustments */
  .dark-theme .element-ref,
  :host-context(.dark-theme) .element-ref {
    --element-ref-bg-end: #3a2878;
    background: linear-gradient(135deg, var(--sys-primary-container, #4f378b) 0%, var(--element-ref-bg-end, #3a2878) 100%);
    color: var(--sys-on-primary-container, #eaddff);
    border-color: var(--sys-outline-variant, rgba(202, 196, 208, 0.3));
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .dark-theme .element-ref:hover,
  :host-context(.dark-theme) .element-ref:hover {
    background: linear-gradient(135deg, var(--sys-primary, #d0bcff) 0%, #b8a4e8 100%);
    color: var(--sys-on-primary, #381e72);
    border-color: var(--sys-primary, #d0bcff);
    box-shadow: 0 2px 6px rgba(208, 188, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .dark-theme .element-ref--has-note::after,
  :host-context(.dark-theme) .element-ref--has-note::after {
    background: var(--sys-tertiary, #efb8c8);
    border-color: var(--sys-surface, #1c1b1f);
  }
`;

/**
 * Get the node name for registering with ProseMirror schema
 */
export const ELEMENT_REF_NODE_NAME = 'elementRef';

/**
 * Schema extension object for adding elementRef to an existing schema
 */
export const elementRefSchemaExtension = {
  nodes: {
    [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec,
  },
};
