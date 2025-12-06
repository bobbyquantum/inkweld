/**
 * Element Reference Module - Public API
 *
 * Re-exports all public types, services, and components for the
 * element reference and relationship system.
 */

// Models
export * from './element-ref.model';

// Relationship types
export {
  DEFAULT_RELATIONSHIP_TYPES,
  getAllRelationshipTypes,
  getCategoryIcon,
  getCategoryLabel,
  getRelationshipLabel,
  getRelationshipTypeById,
  getRelationshipTypesByCategory,
} from './default-relationship-types';

// ProseMirror schema
export {
  ELEMENT_REF_NODE_NAME,
  elementRefNodeSpec,
  elementRefSchemaExtension,
  elementRefStyles,
} from './element-ref-schema';

// Extended schema for ngx-editor
export {
  createExtendedSchema,
  extendedSchema,
  ngxEditorSchema,
} from './extended-schema';

// ProseMirror plugin
export type {
  ElementRefPluginCallbacks,
  ElementRefPluginState,
} from './element-ref-plugin';
export {
  cancelElementRef,
  createElementRefPlugin,
  deleteElementRef,
  elementRefPluginKey,
  getElementRefState,
  insertElementRef,
  isElementRefActive,
  updateElementRefText,
} from './element-ref-plugin';

// Services
export { ElementRefService } from './element-ref.service';

// Components
export {
  type ElementRefAction,
  type ElementRefContextData,
  ElementRefContextMenuComponent,
} from './element-ref-context-menu/element-ref-context-menu.component';
export { ElementRefPopupComponent } from './element-ref-popup/element-ref-popup.component';
export {
  type ElementPreviewContent,
  ElementRefTooltipComponent,
  type ElementRefTooltipData,
} from './element-ref-tooltip/element-ref-tooltip.component';
