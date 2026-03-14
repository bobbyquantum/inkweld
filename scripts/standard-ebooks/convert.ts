#!/usr/bin/env bun
/**
 * Standard Ebooks → Inkweld Archive Converter
 *
 * Clones a Standard Ebooks GitHub repo and converts it into an .inkweld.zip
 * archive file suitable for import into Inkweld. Intended for generating
 * test fixtures to verify formatting and performance with real long-form content.
 *
 * Usage:
 *   bun run scripts/standard-ebooks/convert.ts <source> [options]
 *
 * Source can be:
 *   - Full GitHub URL:  https://github.com/standardebooks/g-k-chesterton_the-napoleon-of-notting-hill
 *   - Short name:       g-k-chesterton_the-napoleon-of-notting-hill
 *
 * Options:
 *   --output <dir>       Output directory (default: test-data/standard-ebooks/)
 *   --include-frontmatter   Include front/back matter sections (default: true)
 *   --no-frontmatter        Exclude front/back matter
 *   --include-endnotes      Include endnotes document (default: false)
 *   --keep-repo             Don't delete the cloned repo after conversion
 *   --help                  Show this help message
 *
 * Examples:
 *   bun run scripts/standard-ebooks/convert.ts g-k-chesterton_the-napoleon-of-notting-hill
 *   bun run scripts/standard-ebooks/convert.ts https://github.com/standardebooks/jane-austen_pride-and-prejudice --no-frontmatter
 *   bun run scripts/standard-ebooks/convert.ts herman-melville_moby-dick --output ./my-fixtures
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { basename, join, resolve } from 'path';
import { buildArchive } from './archive-builder.js';
import { parseContentOpf, parseTocXhtml } from './metadata.js';
import { getAndClearGaps, parseXhtmlFile } from './parser.js';
import type { ConvertOptions, ParityGap, SESection, SETocEntry } from './types.js';

// ── CLI argument parsing ─────────────────────────────────────

function parseArgs(): ConvertOptions {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let source = '';
  let outputDir = resolve('test-data/standard-ebooks');
  let includeFrontmatter = true;
  let includeEndnotes = false;
  let keepRepo = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output' || arg === '-o') {
      outputDir = resolve(args[++i]);
    } else if (arg === '--include-frontmatter') {
      includeFrontmatter = true;
    } else if (arg === '--no-frontmatter') {
      includeFrontmatter = false;
    } else if (arg === '--include-endnotes') {
      includeEndnotes = true;
    } else if (arg === '--keep-repo') {
      keepRepo = true;
    } else if (!arg.startsWith('-')) {
      source = arg;
    }
  }

  if (!source) {
    console.error('Error: No source specified. Run with --help for usage.');
    process.exit(1);
  }

  return { source, outputDir, includeFrontmatter, includeEndnotes, keepRepo };
}

function printUsage() {
  console.log(`
Standard Ebooks → Inkweld Archive Converter

Usage:
  bun run scripts/standard-ebooks/convert.ts <source> [options]

Source:
  GitHub URL or short name (e.g. "g-k-chesterton_the-napoleon-of-notting-hill")

Options:
  --output <dir>          Output directory (default: test-data/standard-ebooks/)
  --include-frontmatter   Include front/back matter (default)
  --no-frontmatter        Exclude front/back matter
  --include-endnotes      Include endnotes document
  --keep-repo             Keep cloned repo after conversion
  --help                  Show this help
  `);
}

// ── Main conversion pipeline ─────────────────────────────────

async function main() {
  const options = parseArgs();
  const repoName = extractRepoName(options.source);
  const repoUrl = toGitHubUrl(options.source);

  console.log(`\n📚 Standard Ebooks → Inkweld Converter`);
  console.log(`   Source: ${repoName}`);
  console.log(`   Output: ${options.outputDir}/`);
  console.log('');

  // Step 1: Clone the repo
  const tempDir = join(options.outputDir, `.tmp-${repoName}`);
  try {
    await cloneRepo(repoUrl, tempDir);

    // Step 2: Locate SE files
    const epubDir = join(tempDir, 'src', 'epub');
    if (!existsSync(epubDir)) {
      throw new Error(`Not a Standard Ebooks repo — missing src/epub/ directory`);
    }

    // Step 3: Parse content.opf
    console.log('📖 Parsing metadata...');
    const opfPath = join(epubDir, 'content.opf');
    const opfXml = readFileSync(opfPath, 'utf-8');
    const { metadata, spine } = parseContentOpf(opfXml);
    console.log(`   Title: ${metadata.title}`);
    console.log(`   Author: ${metadata.author}`);
    if (metadata.wordCount) console.log(`   Word count: ${metadata.wordCount.toLocaleString()}`);

    // Step 4: Parse TOC
    console.log('📑 Parsing table of contents...');
    const tocPath = join(epubDir, 'toc.xhtml');
    let tocEntries: SETocEntry[] = [];
    if (existsSync(tocPath)) {
      const tocXml = readFileSync(tocPath, 'utf-8');
      tocEntries = parseTocXhtml(tocXml);
      console.log(`   TOC entries: ${countTocEntries(tocEntries)}`);
    }

    // Step 5: Parse XHTML content files in spine order
    console.log('📝 Parsing content...');
    const textDir = join(epubDir, 'text');
    const allSections: SESection[] = [];

    for (const spineItem of spine) {
      const filePath = join(epubDir, spineItem.href);
      if (!existsSync(filePath)) {
        console.warn(`   ⚠️  Missing spine file: ${spineItem.href}`);
        continue;
      }

      const xhtml = readFileSync(filePath, 'utf-8');
      const fileName = basename(spineItem.href);
      const sections = parseXhtmlFile(xhtml, fileName);

      // If parsing returned no sections, try to match with TOC for title
      if (sections.length === 0) {
        console.log(`   ⏭️  Skipped: ${fileName} (no parseable content)`);
        continue;
      }

      // Enhance section titles from TOC if available
      enhanceTitlesFromToc(sections, tocEntries, spineItem.href);

      allSections.push(...sections);
      const contentCount = countContentNodes(sections);
      console.log(`   ✅ ${fileName}: ${sections.length} section(s), ~${contentCount} content nodes`);
    }

    if (allSections.length === 0) {
      throw new Error('No content sections were parsed from the XHTML files');
    }

    // Step 6: Check for extra text files not in spine
    if (existsSync(textDir)) {
      const textFiles = readdirSync(textDir).filter((f) => f.endsWith('.xhtml'));
      const spineFiles = new Set(spine.map((s) => basename(s.href)));
      const extraFiles = textFiles.filter((f) => !spineFiles.has(f));
      if (extraFiles.length > 0) {
        console.log(`   ℹ️  Files not in spine (skipped): ${extraFiles.join(', ')}`);
      }
    }

    // Step 7: Build archive
    console.log('\n📦 Building .inkweld.zip archive...');
    const archiveData = await buildArchive(metadata, allSections, {
      includeFrontmatter: options.includeFrontmatter,
      includeEndnotes: options.includeEndnotes,
    });

    // Step 8: Write output
    const slug = slugify(metadata.title);
    const outputPath = join(options.outputDir, `${slug}.inkweld.zip`);
    mkdirSync(options.outputDir, { recursive: true });
    await Bun.write(outputPath, archiveData);

    // Step 9: Report parity gaps
    const gaps = getAndClearGaps();
    printResults(metadata, allSections, archiveData, outputPath, gaps);
  } finally {
    // Cleanup
    if (!options.keepRepo && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────

function extractRepoName(source: string): string {
  // Handle full GitHub URLs
  if (source.includes('github.com')) {
    const match = source.match(/github\.com\/[^/]+\/([^/\s]+)/);
    return match ? match[1].replace(/\.git$/, '') : source;
  }
  return source;
}

function toGitHubUrl(source: string): string {
  if (source.startsWith('http')) return source;
  return `https://github.com/standardebooks/${source}`;
}

async function cloneRepo(url: string, dest: string): Promise<void> {
  console.log('📥 Cloning repository...');
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }

  const proc = Bun.spawn(['git', 'clone', '--depth', '1', url, dest], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to clone ${url}: ${stderr}`);
  }
  console.log('   ✅ Cloned successfully');
}

/**
 * Try to match parsed sections to TOC entries for better display titles.
 */
function enhanceTitlesFromToc(sections: SESection[], tocEntries: SETocEntry[], spineHref: string): void {
  const fileName = basename(spineHref);

  for (const entry of tocEntries) {
    const entryFile = entry.href.split('#')[0];
    if (entryFile === fileName) {
      // Direct match — this TOC entry corresponds to this file
      const fragment = entry.href.includes('#') ? entry.href.split('#')[1] : null;

      if (fragment) {
        // Match by section ID
        const section = findSectionById(sections, fragment);
        if (section && (!section.title || section.title === section.sectionType)) {
          section.title = entry.label;
        }
      } else if (sections.length === 1 && (!sections[0].title || sections[0].title === sections[0].sectionType)) {
        sections[0].title = entry.label;
      }
    }

    // Recurse into child TOC entries
    if (entry.children.length > 0) {
      enhanceTitlesFromToc(sections, entry.children, spineHref);

      // Also check nested sections
      for (const section of sections) {
        if (section.children.length > 0) {
          enhanceTitlesFromToc(section.children, entry.children, spineHref);
        }
      }
    }
  }
}

function findSectionById(sections: SESection[], id: string): SESection | undefined {
  for (const section of sections) {
    if (section.id === id) return section;
    const found = findSectionById(section.children, id);
    if (found) return found;
  }
  return undefined;
}

function countTocEntries(entries: SETocEntry[]): number {
  return entries.reduce((count, e) => count + 1 + countTocEntries(e.children), 0);
}

function countContentNodes(sections: SESection[]): number {
  return sections.reduce(
    (count, s) => count + s.content.length + countContentNodes(s.children),
    0,
  );
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function printResults(
  metadata: { title: string; author: string; wordCount?: number },
  sections: SESection[],
  archiveData: Uint8Array,
  outputPath: string,
  gaps: ParityGap[],
): void {
  const totalElements = countElements(sections);
  const sizeMB = (archiveData.length / 1024 / 1024).toFixed(2);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Conversion complete!`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   📖 "${metadata.title}" by ${metadata.author}`);
  if (metadata.wordCount) {
    console.log(`   📊 ~${metadata.wordCount.toLocaleString()} words`);
  }
  console.log(`   🗂️  ${totalElements.folders} folders, ${totalElements.items} documents`);
  console.log(`   💾 ${sizeMB} MB → ${outputPath}`);

  if (gaps.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`⚠️  Parity Gaps (SE features not fully supported in Inkweld):`);
    console.log(`${'─'.repeat(60)}`);
    for (const gap of gaps) {
      const icon = gap.severity === 'limitation' ? '🔴' : gap.severity === 'warning' ? '🟡' : 'ℹ️ ';
      console.log(`   ${icon} [${gap.severity.toUpperCase()}] ${gap.feature}`);
      console.log(`      ${gap.description}`);
    }
  }

  console.log(`\nTo import: Open Inkweld → Import Project → Select ${basename(outputPath)}\n`);
}

function countElements(sections: SESection[]): { folders: number; items: number } {
  let folders = 0;
  let items = 0;
  for (const s of sections) {
    if (s.children.length > 0) {
      folders++;
      const child = countElements(s.children);
      folders += child.folders;
      items += child.items;
      // If the part itself has content, it gets an item too
      if (s.content.length > 0) items++;
    } else {
      items++;
    }
  }
  return { folders, items };
}

// ── Run ──────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n❌ Error: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
