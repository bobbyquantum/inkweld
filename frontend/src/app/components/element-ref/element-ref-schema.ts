/**
 * Element Reference Schema — frontend wrapper.
 *
 * The node spec, attribute interface, and extension object live in the
 * shared package (`@inkweld/prosemirror/schema`) so the backend can use
 * them too. Only the CSS string stays here — it is frontend-only and
 * injected into the editor stylesheet.
 *
 * ⚠️ Existing imports of `elementRefNodeSpec`, `ELEMENT_REF_NODE_NAME`,
 * `ElementRefNodeAttrs`, and `elementRefSchemaExtension` from this file
 * continue to work via re-export.
 */

import { type ElementRefNodeAttrs as SharedAttrs } from '@inkweld/prosemirror/schema';

import { type ElementType } from '../../../api-client';

export {
  ELEMENT_REF_NODE_NAME,
  elementRefNodeSpec,
  elementRefSchemaExtension,
} from '@inkweld/prosemirror/schema';

/**
 * Frontend-narrowed `ElementRefNodeAttrs`: replaces the shared package's
 * `ElementTypeLike` (string) with the generated `ElementType` enum so
 * existing frontend code keeps strict typing.
 */
export type ElementRefNodeAttrs = Omit<SharedAttrs, 'elementType'> & {
  elementType: ElementType | null;
};

/**
 * CSS styles for element reference nodes.
 *
 * Injected into the document editor's stylesheet. Lives in the frontend
 * because the backend has no DOM and never renders these chips.
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
