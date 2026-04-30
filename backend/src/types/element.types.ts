/**
 * Domain types for project elements.
 *
 * Re-exported here so that services (e.g. yjs.service, yjs-worker.service)
 * can import from the types layer instead of reaching into schemas/,
 * keeping the schemas layer as an OpenAPI/Zod concern only.
 */
export { type Element, type ElementType, ELEMENT_TYPES } from '../schemas/element.schemas';
