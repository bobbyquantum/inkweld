/**
 * Find in Document Module Exports
 *
 * Public API for the find-in-document feature.
 */
export { FindInDocumentComponent } from './find-in-document.component';
export {
  createFindPlugin,
  dispatchClose,
  dispatchNextMatch,
  dispatchPreviousMatch,
  dispatchSearch,
  dispatchToggleCaseSensitive,
  findPluginKey,
  type FindPluginMeta,
  type FindPluginState,
  getFindState,
} from './find-plugin';
