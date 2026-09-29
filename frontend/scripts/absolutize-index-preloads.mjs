#!/usr/bin/env node
/**
 * Rewrite the preload hints in `index.html` to base-absolute URLs.
 *
 * Angular emits `<link rel="modulepreload" href="chunk-XXXX.js">` — a
 * *document-relative* href that only resolves correctly because index.html
 * also carries `<base href="/">`.
 *
 * Cloudflare turns those tags into an Early Hints `Link:` response header,
 * copying each href verbatim:
 *
 *   link: <chunk-XXXX.js>; rel="modulepreload"
 *
 * `<base href>` is a *document* concept and has no effect on HTTP headers, so
 * the browser resolves a header href against the **request URL** instead. The
 * SPA fallback in `public/_redirects` serves index.html for every unmatched
 * path, so any deep link makes the browser preload the app's chunks from the
 * wrong place — `/user/project/chunk-XXXX.js` for `/user/project/settings`, or
 * `/api/v1/appearance/chunk-XXXX.js` when a frontend-only preview (empty
 * `apiUrl`) probes the API on its own origin. Those URLs hit the SPA fallback
 * in turn, so each one returns index.html with `200 text/html` rather than
 * 404ing, and the browser reports:
 *
 *   Failed to load module script: Expected a JavaScript-or-Wasm module script
 *   but the server responded with a MIME type of "text/html".
 *
 * The preloads are speculative, so the app still boots off the correctly-pathed
 * `<script src>` — but every deep-linked page load wastes a request *and* a
 * full index.html download per chunk, and buries real errors in console noise.
 *
 * Making the href base-absolute fixes the header without changing how the
 * document itself resolves: `<base href="/">` already mapped `chunk-XXXX.js` to
 * `/chunk-XXXX.js`, and a base-absolute href in a `Link:` header resolves
 * against the origin rather than the request path.
 *
 * Runs after `ng build` for the Cloudflare targets only — a build served from a
 * non-root base (Electron's `file://`, for one) keeps its relative hrefs. Pass
 * the build output base as the first argument (default `dist`); rewrites
 * `<base>/browser/index.html`. Fails if index.html is absent. An index.html
 * with no preload hints (Angular 22.2 stopped emitting them) has nothing for
 * Cloudflare to promote into Early Hints, so it is left untouched.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `rel` values Cloudflare promotes into an Early Hints `Link:` header. */
const PRELOAD_RELS = ['modulepreload', 'preload'];

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const outputBase = process.argv[2] ?? 'dist';
const indexPath = path.resolve(frontendRoot, outputBase, 'browser/index.html');

/** Hrefs that already resolve without a base: absolute, protocol-relative, inline. */
function isAlreadyResolvable(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(href);
}

/**
 * The `<base href>` the document carries, normalised to end in `/`.
 *
 * Preloads are rewritten against this rather than a hardcoded `/` so a build
 * with a nested baseHref stays correct.
 */
function readBaseHref(html) {
  const match = /<base\b[^>]*\bhref="([^"]*)"/i.exec(html);
  const href = match?.[1] ?? '/';
  return href.endsWith('/') ? href : `${href}/`;
}

const html = await readFile(indexPath, 'utf8');
const baseHref = readBaseHref(html);

if (!isAlreadyResolvable(baseHref)) {
  throw new Error(
    `${indexPath}: <base href="${baseHref}"> is itself relative; refusing to rewrite preloads against it.`
  );
}

let seen = 0;
let rewritten = 0;
const relPattern = PRELOAD_RELS.join('|');

// Only `<link>` tags whose rel is a preload hint, and only their href.
const updated = html.replace(
  new RegExp(`<link\\b[^>]*\\brel="(?:${relPattern})"[^>]*>`, 'gi'),
  tag =>
    tag.replace(/\bhref="([^"]*)"/i, (attr, href) => {
      seen += 1;
      if (isAlreadyResolvable(href)) {
        return attr;
      }
      rewritten += 1;
      return `href="${baseHref}${href}"`;
    })
);

// No hints means no Early Hints header to fix; leave the file untouched.
if (seen === 0) {
  console.log(
    `absolutize-index-preloads: no ${PRELOAD_RELS.map(rel => `rel="${rel}"`).join('/')} hints in ${path.relative(frontendRoot, indexPath)}; nothing to rewrite`
  );
  process.exit(0);
}

await writeFile(indexPath, updated);

console.log(
  `absolutize-index-preloads: rewrote ${rewritten}/${seen} preload href(s) against base "${baseHref}" in ${path.relative(frontendRoot, indexPath)}`
);
