/**
 * Backend XML utility re-exports.
 *
 * The canonical implementation now lives in `@inkweld/prosemirror/xml`
 * so that backend (Bun + Cloudflare Workers) and frontend (browser)
 * share a single byte-for-byte compatible parser/serializer pair.
 */

export {
  decodeXmlEntities,
  skipTopLevelWhitespace,
  xmlContentToText,
} from '@inkweld/prosemirror/xml';
