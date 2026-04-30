/**
 * Editor plugins re-export barrel.
 *
 * document.service.ts imports ProseMirror plugin factories from here instead
 * of reaching directly into components/. The plugins themselves still live
 * alongside their UI siblings in components/ (where they share types and
 * services) — this barrel is purely a layering adapter so the service layer
 * has a stable, non-component import path.
 */

export { createCommentPlugin } from '@components/comment-mark/comment-plugin';
export { createKeyboardShortcutsPlugin } from '@components/editor-shortcuts/editor-shortcuts-plugin';
export { ElementRefService } from '@components/element-ref/element-ref.service';
export {
  cancelElementRef,
  createElementRefPlugin,
  deleteElementRef,
  type ElementRefPluginCallbacks,
  elementRefPluginKey,
  type ElementRefPluginState,
  getElementRefState,
  insertElementRef,
  isElementRefActive,
  updateElementRefText,
} from '@components/element-ref/element-ref-plugin';
export { createFindPlugin } from '@components/find-in-document/find-plugin';
export {
  createImagePastePlugin,
  extractMediaId,
  generateMediaId,
  isMediaUrl,
} from '@components/image-paste/image-paste-plugin';
export { createLintPlugin } from '@components/lint/lint-plugin';
