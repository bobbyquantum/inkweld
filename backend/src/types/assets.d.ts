/**
 * Binary assets. What an import gives depends on the runtime: a path with
 * `with { type: 'file' }` under Bun, a module or an ArrayBuffer under Wrangler.
 * Each importer knows which it is and casts accordingly.
 */
declare module '*.wasm' {
  const asset: string;
  export default asset;
}

declare module '*.bin' {
  const asset: string;
  export default asset;
}
