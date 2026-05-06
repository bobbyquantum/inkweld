/**
 * Canonical Inkweld ProseMirror XML format — entry point.
 *
 * This module is the **single source of truth** for converting
 * between Inkweld's ProseMirror XML wire format and Y.XmlFragment
 * structures. Both runtimes (Bun + Cloudflare Workers backend, Angular
 * frontend) import from here so that all conversions stay byte-for-byte
 * compatible.
 */

export {
  decodeXmlEntities,
  escapeXmlAttr,
  escapeXmlText,
  skipTopLevelWhitespace,
} from './entities';
export {
  BLOCK_NODE_NAMES,
  LINK_ATTR_NAMES,
  MARK_TO_TAG,
  NODE_TAG_ALIASES,
  TAG_TO_MARK,
} from './tags';
export {
  parseAttrValue,
  parseXmlToYjsNodes,
  type MarkMap,
  type YxmlNode,
} from './parser';
export { applyXmlToYjsFragment, serializeYjsFragmentToXml } from './serializer';
export { xmlContentToText } from './text';
export {
  parseXmlToAst,
  parseAttrValue as parseAstAttrValue,
  type AstElement,
  type AstNode,
  type AstText,
} from './ast';
