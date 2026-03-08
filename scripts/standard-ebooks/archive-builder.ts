/**
 * Builds an .inkweld.zip archive from parsed Standard Ebooks content.
 *
 * Assembles all the required JSON files and packages them into the
 * Inkweld archive format (version 1).
 */

import JSZip from 'jszip';
import { nanoid } from 'nanoid';
import type {
  InkweldDocument,
  InkweldElement,
  InkweldManifest,
  InkweldProject,
  InkweldPublishPlan,
  InkweldPublishPlanItem,
  ProseMirrorNode,
  SEBookMetadata,
  SESection,
} from './types.js';

const ARCHIVE_VERSION = 1;

/** Context passed between helper functions */
interface BuildContext {
  elements: InkweldElement[];
  documents: InkweldDocument[];
  nextOrder: Map<string | null, number>; // parentId → next order value
}

/**
 * Build a complete .inkweld.zip from SE book data.
 */
export async function buildArchive(
  metadata: SEBookMetadata,
  sections: SESection[],
  options: { includeFrontmatter: boolean; includeEndnotes: boolean },
): Promise<Uint8Array> {
  const slug = slugify(metadata.title);
  const ctx: BuildContext = {
    elements: [],
    documents: [],
    nextOrder: new Map(),
  };

  // ── Classify sections into front matter, body, and back matter ──
  const frontMatter: SESection[] = [];
  const bodyContent: SESection[] = [];
  const backMatter: SESection[] = [];

  for (const section of sections) {
    const type = section.sectionType;
    if (['titlepage', 'imprint', 'halftitlepage', 'dedication', 'preface', 'foreword', 'introduction'].includes(type)) {
      frontMatter.push(section);
    } else if (['colophon', 'uncopyright', 'endnotes', 'appendix', 'afterword', 'loi'].includes(type)) {
      backMatter.push(section);
    } else {
      bodyContent.push(section);
    }
  }

  // ── Build element tree ──

  // Front matter folder (optional)
  if (options.includeFrontmatter && frontMatter.length > 0) {
    const folderId = createFolder(ctx, null, 'Front Matter');
    for (const section of frontMatter) {
      addSectionAsElement(ctx, section, folderId, 1);
    }
  }

  // Body content — may be flat chapters or nested books/parts
  for (const section of bodyContent) {
    addSectionAsElement(ctx, section, null, 0);
  }

  // Back matter folder (optional)
  if (options.includeFrontmatter && backMatter.length > 0) {
    const bmFiltered = options.includeEndnotes ? backMatter : backMatter.filter((s) => s.sectionType !== 'endnotes');

    if (bmFiltered.length > 0) {
      const folderId = createFolder(ctx, null, 'Back Matter');
      for (const section of bmFiltered) {
        addSectionAsElement(ctx, section, folderId, 1);
      }
    }
  }

  // ── Assemble archive ──
  const manifest: InkweldManifest = {
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: '0.1.0',
    projectTitle: metadata.title,
    originalSlug: slug,
  };

  const project: InkweldProject = {
    title: metadata.title,
    description: `By ${metadata.author}`,
    slug,
    hasCover: false,
  };

  // Package into ZIP
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify(project, null, 2));
  zip.file('elements.json', JSON.stringify(ctx.elements, null, 2));
  zip.file('documents.json', JSON.stringify(ctx.documents, null, 2));
  zip.file('worldbuilding.json', '[]');
  zip.file('schemas.json', '[]');
  zip.file('relationships.json', '[]');
  zip.file('relationship-types.json', '[]');
  zip.file('tags.json', '[]');
  zip.file('element-tags.json', '[]');
  const publishPlan = buildPublishPlan(metadata, ctx.elements);
  zip.file('publish-plans.json', JSON.stringify([publishPlan], null, 2));
  zip.file('media-index.json', '[]');

  const data = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return data;
}

/**
 * Recursively add an SE section as Inkweld elements.
 * Parts/books become FOLDERs; chapters/leaf sections become ITEMs.
 */
function addSectionAsElement(ctx: BuildContext, section: SESection, parentId: string | null, level: number): void {
  if (section.children.length > 0) {
    // Container section (part/book) → FOLDER
    const folderId = createFolder(ctx, parentId, section.title);

    // If the part itself has content (e.g. a part heading intro paragraph), add as first item
    if (section.content.length > 0) {
      createItem(ctx, folderId, section.title, section.content, level + 1);
    }

    // Add child sections
    for (const child of section.children) {
      addSectionAsElement(ctx, child, folderId, level + 1);
    }
  } else {
    // Leaf section (chapter, dedication, etc.) → ITEM
    createItem(ctx, parentId, section.title, section.content, level);
  }
}

/** Create a FOLDER element. Returns the folder's ID. */
function createFolder(ctx: BuildContext, parentId: string | null, name: string): string {
  const id = nanoid();
  const order = getNextOrder(ctx, parentId);
  const level = parentId ? (ctx.elements.find((e) => e.id === parentId)?.level ?? -1) + 1 : 0;

  ctx.elements.push({
    id,
    name,
    type: 'FOLDER',
    parentId,
    order,
    level,
    expandable: true,
    version: 1,
    metadata: {},
  });

  return id;
}

/** Create an ITEM element with document content. */
function createItem(
  ctx: BuildContext,
  parentId: string | null,
  name: string,
  content: ProseMirrorNode[],
  level: number,
): string {
  const id = nanoid();
  const order = getNextOrder(ctx, parentId);

  ctx.elements.push({
    id,
    name,
    type: 'ITEM',
    parentId,
    order,
    level,
    expandable: false,
    version: 1,
    metadata: {},
  });

  // Only add document if there's actual content
  if (content.length > 0) {
    ctx.documents.push({
      elementId: id,
      content,
    });
  }

  return id;
}

/** Get the next order value for children of a given parent. */
function getNextOrder(ctx: BuildContext, parentId: string | null): number {
  const key = parentId;
  const current = ctx.nextOrder.get(key) ?? 0;
  ctx.nextOrder.set(key, current + 1);
  return current;
}

/** Convert a title to a URL-friendly slug. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

/**
 * Walk the element tree depth-first, returning all ITEM elements in reading order.
 * Folders are traversed but not included — only their leaf ITEM children appear.
 */
function getItemsInReadingOrder(elements: InkweldElement[], parentId: string | null): InkweldElement[] {
  const children = elements.filter((e) => e.parentId === parentId).sort((a, b) => a.order - b.order);

  const result: InkweldElement[] = [];
  for (const child of children) {
    if (child.type === 'ITEM') {
      result.push(child);
    } else if (child.type === 'FOLDER') {
      result.push(...getItemsInReadingOrder(elements, child.id));
    }
  }
  return result;
}

/**
 * Build an EPUB publish plan that lists every ITEM element individually.
 *
 * The plan includes:
 * - Title page frontmatter
 * - Table of contents
 * - Every ITEM element in reading (depth-first) order as a chapter
 * - SE metadata mapped to EPUB fields (author, language, description, subjects)
 *
 * This matches the `createQuickExportPlan()` pattern in the frontend — each
 * document is listed explicitly with `includeChildren: false`.
 */
function buildPublishPlan(metadata: SEBookMetadata, elements: InkweldElement[]): InkweldPublishPlan {
  const now = new Date().toISOString();
  const items: InkweldPublishPlanItem[] = [];

  // Title page
  items.push({
    id: nanoid(),
    type: 'frontmatter',
    contentType: 'title-page',
  });

  // Table of contents
  items.push({
    id: nanoid(),
    type: 'toc',
    title: 'Contents',
    depth: 2,
    includePageNumbers: false,
  });

  // Collect every ITEM in depth-first reading order
  const itemElements = getItemsInReadingOrder(elements, null);
  for (const element of itemElements) {
    items.push({
      id: nanoid(),
      type: 'element',
      elementId: element.id,
      includeChildren: false,
      isChapter: true,
    });
  }

  return {
    id: nanoid(),
    name: 'EPUB Export',
    format: 'EPUB',
    createdAt: now,
    updatedAt: now,
    metadata: {
      title: metadata.title,
      author: metadata.author,
      language: metadata.language,
      description: metadata.description || undefined,
      keywords: metadata.subjects.length > 0 ? metadata.subjects : undefined,
    },
    items,
    options: {
      chapterNumbering: 'none',
      sceneBreakText: '* * *',
      includeWordCounts: false,
      includeToc: true,
      includeCover: false,
      fontFamily: 'Georgia, serif',
      fontSize: 12,
      lineHeight: 1.5,
    },
  };
}
