# Publish services: agent notes

Publish generators read documents and never write back to stored content.
Overview: `docs/site/docs/developer/architecture.md` → "Publish output".

## EPUB output

`epub-generator.service.ts` targets EPUBCheck-clean EPUB 3.3 with EPUB 2
fallbacks (NCX, `<guide>`, `<meta name="cover">`) for Kindle and older
readers. Pure helpers live in `epub-utils.ts`. Rules that are easy to break:

- **Filenames are assigned once, globally** (`assignFilenames`, after all items
  are processed). Never derive a filename from a per-item counter — that made
  every chapter `chapter_001.xhtml`, so the zip kept only the last one.
- **Every resource must be inside the container.** Document images (`media:`
  ids, `data:` URLs, and http(s) when CORS allows) are copied into
  `OEBPS/images/` with a sniffed media type; only EPUB core image types are
  packaged, anything else becomes a visible placeholder plus a warning.
- **Markup is whitelisted.** Unknown node types render their children with no
  wrapper, and only specific attributes (`start`, `colspan`, `rowspan`,
  align/indent classes) are emitted. Plan text fields (dedication, custom
  front/back matter) are plain text → escaped paragraphs, never raw HTML.
  `escapeXml` also strips XML-invalid control characters, which otherwise make
  a chapter unreadable.
- `dcterms:modified` must have no milliseconds (`epubTimestamp`). The
  identifier is the ISBN, or a UUID derived from project + plan id so
  re-exports update the same book in readers; the NCX `dtb:uid` must match it.
- Scene/chapter-break separators are appended to the preceding chapter; page
  breaks are no-ops (each content document starts a page). A plan TOC item
  puts `nav.xhtml` in the spine at that position; its `depth` hides deeper
  levels on the page (`hidden`) while keeping them in reader navigation.
- **Cover is always embedded.** `loadCoverBlob` tries the plan's
  `options.coverImage`, then the project's stored cover; when neither exists
  `DefaultCoverRendererService` draws the home-page placeholder (the
  `default_cover.webp` artwork plus title and author) to a JPEG. The
  placeholder is CSS only, so it is not a media file anywhere else.
- **Typographic quotes** (`typography.ts`, `smartenDocument`) run on the
  content tree before rendering in the EPUB, PDF, HTML and website generators,
  per `plan.options.typographicQuotes` (unset = on except Markdown) and the
  plan language. They never touch stored documents; keep code skipping and
  whole-paragraph context when changing them.
- **EPUB is reflowable.** The style editor gets `[reflowable]="true"` for it,
  which hides page setup and swaps the print presets for the `ebook*` ones
  (`reflowablePresets`). The EPUB generator ignores `styles.page`.
- Element references are written with an `inkweld-element:` sentinel href and
  rewritten to the target chapter file (or unlinked) in `resolveElementRefs`.

## Conversations

Publishing flattens each speech to `**Name:** *(note)* line` before any
exporter runs (`flattenConversation` in `conversation-publish.ts`). See
`components/conversation/AGENTS.md`.

## Published file share links

A published file shared as "Anyone with link" / "Anyone" gets a link to
`<server>/share/<token>`. The **API server** serves that page
(`backend/src/routes/share-page.routes.ts`, a static HTML page with no script,
rendered by `utils/share-page.ts`), not the Angular app. On a split deployment
the frontend origin can't tell which server issued a token. The page's
Download button is a relative link to `GET /api/v1/share/:token`.

- The client builds the link from `setupService.getServerUrl()`; the backend's
  `share-link` endpoint uses `getPublicApiUrl(c)` (`BASE_URL`, else the request
  origin). Never use `getBaseUrl` (SITE_URL) here: on split deployments it is
  the frontend.
- Only the server issues share tokens. `PublishedFilesService` must store the
  server's record (its id **and** token) after an upload or a permission change.
  The local copy of the file is moved to the server id. Never generate a token
  on the client.
- `share` is a reserved username, and `/share/**` is excluded from the service
  worker's `navigationUrls`, so the page is reachable when the SPA shares its
  origin.
- "Anyone with link" sends `X-Robots-Tag: noindex, nofollow`. "Anyone" allows
  indexing. Both open with the link; nothing lists public files yet.
