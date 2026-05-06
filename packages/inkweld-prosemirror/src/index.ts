/**
 * @inkweld/prosemirror
 *
 * Aggregate barrel for convenience. Most consumers should import from a
 * specific subpath (`./schema`, `./xml`, `./markdown`, `./uri`, `./runtime`)
 * to avoid pulling unused code into their bundle.
 */
export * from './schema';
export * from './xml';
export * from './markdown';
export * from './uri';
export * from './runtime';
