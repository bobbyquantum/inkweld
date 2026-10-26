/**
 * Release notes helpers shared by the app and the build.
 *
 * `scripts/write-sw-app-data.ts` runs {@link summarizeChangelog} after
 * `ng build` and stores the result as the `appData` of `ngsw.json`. Angular's
 * service worker hands the new build's `appData` to the running (older) app in
 * its `VERSION_READY` event, so the update dialog can say which version is
 * waiting and what changed before the user reloads. Keep this file free of
 * Angular imports: Bun loads it directly in that script.
 */

/** One release in the update `appData`, newest first. */
export interface ReleaseSummary {
  version: string;
  /** Plain-text highlight lines, features first. */
  highlights: string[];
  /** How many further changes the release has beyond `highlights`. */
  more: number;
}

/** The `appData` the build writes into `ngsw.json`. */
export interface UpdateAppData {
  version: string;
  releases: ReleaseSummary[];
}

/** What kind of version bump an update is. */
export type UpdateKind =
  | 'major'
  | 'minor'
  | 'patch'
  | 'stable'
  | 'alpha'
  | 'beta'
  | 'rc'
  | 'prerelease';

interface ParsedVersion {
  core: [number, number, number];
  prerelease: (string | number)[];
}

const VERSION_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?(?:\+[\dA-Za-z.-]+)?$/;

/** Parse a SemVer string (an optional leading `v` is allowed). */
export function parseVersion(version: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(version.trim());
  if (!match) return null;
  const prerelease = match[4]
    ? match[4]
        .split('.')
        .map(part => (/^\d+$/.test(part) ? Number(part) : part))
    : [];
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease,
  };
}

function compareIdentifier(x: string | number, y: string | number): number {
  if (x === y) return 0;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  // Numeric identifiers sort below alphanumeric ones.
  if (typeof x === 'number') return -1;
  if (typeof y === 'number') return 1;
  return x < y ? -1 : 1;
}

function comparePrerelease(
  a: (string | number)[],
  b: (string | number)[]
): number {
  // A release outranks any of its pre-releases (1.0.0 > 1.0.0-beta.9).
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const diff = compareIdentifier(a[i], b[i]);
    if (diff !== 0) return diff;
  }
  // A longer set of identifiers wins when the shared ones are equal.
  return a.length - b.length;
}

/**
 * Compare two versions by SemVer precedence, pre-release tags included.
 * Returns a negative number, zero or a positive number, or `null` when either
 * version can't be parsed.
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    const diff = pa.core[i] - pb.core[i];
    if (diff !== 0) return diff;
  }
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** True when `candidate` is a newer version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return (compareVersions(candidate, current) ?? 0) > 0;
}

const PRERELEASE_CHANNELS: Record<string, UpdateKind> = {
  alpha: 'alpha',
  beta: 'beta',
  rc: 'rc',
};

/**
 * Classify the bump from `from` to `to`: a pre-release channel (`beta`, …)
 * when the target is a pre-release, `stable` when it leaves a pre-release for
 * a release, otherwise `major`/`minor`/`patch`. Returns `null` unless `to` is
 * newer than `from`.
 */
export function classifyUpdate(from: string, to: string): UpdateKind | null {
  const pf = parseVersion(from);
  const pt = parseVersion(to);
  if (!pf || !pt || !isNewerVersion(to, from)) return null;

  if (pt.prerelease.length > 0) {
    const channel = pt.prerelease[0];
    return (
      (typeof channel === 'string'
        ? PRERELEASE_CHANNELS[channel.toLowerCase()]
        : undefined) ?? 'prerelease'
    );
  }
  if (pf.prerelease.length > 0) return 'stable';
  if (pt.core[0] !== pf.core[0]) return 'major';
  if (pt.core[1] !== pf.core[1]) return 'minor';
  return 'patch';
}

/**
 * Version headings (the text after `## `) the changelog may contain:
 * - Keep a Changelog: `[1.0.0] - 2025-01-01` or `[Unreleased]`
 * - release-please: `[1.0.1](https://…/compare/v1.0.0...v1.0.1) (2026-10-10)`
 * - release-please without a previous tag: `1.0.1 (2026-10-10)`
 */
const VERSION_HEADER_PATTERNS = [
  /^\[([^\]]+)\](?: - (.+))?$/,
  /^\[([^\]]+)\]\([^)\s]*\)(?: \(([^)]+)\))?$/,
  /^(\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?)(?: \(([^)]+)\))?$/,
];

export function parseVersionHeader(
  header: string
): { version: string; date: string } | null {
  for (const pattern of VERSION_HEADER_PATTERNS) {
    const match = pattern.exec(header);
    if (match) {
      return { version: match[1], date: match[2] ?? '' };
    }
  }
  return null;
}

/** A `## <version>` section of the changelog, still in Markdown. */
export interface ChangelogSection {
  version: string;
  date: string;
  markdown: string;
}

/** Split a changelog into its version sections, newest first. */
export function splitChangelog(text: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  // The part before the first `## ` is the file's preamble.
  for (const section of text.split(/^## /m).slice(1)) {
    const lines = section.split('\n');
    const parsed = parseVersionHeader(lines[0].trim());
    if (!parsed) continue;
    sections.push({
      ...parsed,
      markdown: lines
        .slice(1)
        .join('\n')
        .replace(/---\s*$/, '')
        .trim(),
    });
  }
  return sections;
}

const MAX_HIGHLIGHT_LENGTH = 120;

/** Drop trailing whitespace and punctuation (a loop, not a backtracking regex). */
function trimTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && ' \t\n,;:.'.includes(text[end - 1])) end--;
  return text.slice(0, end);
}

/** The rest of `line` after a `marker` and whitespace, or null if it doesn't start that way. */
function afterMarker(line: string, marker: RegExp): string | null {
  const match = marker.exec(line);
  if (!match) return null;
  const rest = line.slice(match[0].length).trim();
  return rest === '' ? null : rest;
}

/**
 * Turn one changelog bullet into a short plain-text line: drop
 * release-please's `**scope:**` prefix and trailing PR/commit links, unwrap
 * Markdown links and emphasis, and cut long lines at a word boundary.
 */
export function cleanHighlight(bullet: string): string {
  let text = bullet
    .replace(/^\*\*[^*]+:\*\*\s*/, '')
    .replaceAll(/\(\[[^[\]]+\]\([^()]*\)\)/g, '')
    .replaceAll(/\[([^[\]]+)\]\([^()]*\)/g, '$1')
    .replaceAll(/(\*\*|__|`)/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (text.length > MAX_HIGHLIGHT_LENGTH) {
    const cut = text.slice(0, MAX_HIGHLIGHT_LENGTH - 1);
    const space = cut.lastIndexOf(' ');
    text = `${trimTrailingPunctuation(space > 40 ? cut.slice(0, space) : cut)}…`;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The top-level bullets of a changelog section grouped by their `###`
 * heading. Wrapped continuation lines are joined; nested bullets are skipped.
 */
function collectBullets(
  markdown: string
): { heading: string; bullets: string[] }[] {
  const groups: { heading: string; bullets: string[] }[] = [];
  let group: { heading: string; bullets: string[] } | null = null;
  let inBullet = false;
  for (const line of markdown.split('\n')) {
    const heading = afterMarker(line, /^###\s/);
    if (heading !== null) {
      group = { heading, bullets: [] };
      groups.push(group);
      inBullet = false;
      continue;
    }
    const bullet = afterMarker(line, /^[*-]\s/);
    if (bullet !== null) {
      if (!group) {
        group = { heading: '', bullets: [] };
        groups.push(group);
      }
      group.bullets.push(bullet);
      inBullet = true;
      continue;
    }
    if (inBullet && group && /^\s+\S/.test(line) && !/^\s+[*-]\s/.test(line)) {
      group.bullets[group.bullets.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (line.trim() === '' || !/^\s/.test(line)) inBullet = false;
  }
  return groups;
}

/** Highlights of one section: Features first, then the rest in order. */
function sectionHighlights(
  markdown: string,
  maxHighlights: number
): Pick<ReleaseSummary, 'highlights' | 'more'> {
  const groups = collectBullets(markdown);
  const ordered = [
    ...groups.filter(g => /^features?$/i.test(g.heading)),
    ...groups.filter(g => !/^features?$/i.test(g.heading)),
  ].flatMap(g => g.bullets);
  const highlights = ordered
    .slice(0, maxHighlights)
    .map(cleanHighlight)
    .filter(Boolean);
  return { highlights, more: Math.max(0, ordered.length - highlights.length) };
}

/** Summarize the newest released versions of a changelog. */
export function summarizeChangelog(
  text: string,
  { maxReleases = 10, maxHighlights = 5 } = {}
): ReleaseSummary[] {
  return splitChangelog(text)
    .filter(section => parseVersion(section.version) !== null)
    .slice(0, maxReleases)
    .map(section => ({
      version: section.version,
      ...sectionHighlights(section.markdown, maxHighlights),
    }));
}

/**
 * Validate an untyped `appData` value from the service worker. Returns `null`
 * when it isn't an {@link UpdateAppData} (an older build, or a build that
 * skipped `write-sw-app-data`).
 */
export function readUpdateAppData(value: unknown): UpdateAppData | null {
  if (typeof value !== 'object' || value === null) return null;
  const { version, releases } = value as Record<string, unknown>;
  if (typeof version !== 'string' || !parseVersion(version)) return null;
  const valid = Array.isArray(releases)
    ? releases.filter(
        (r): r is ReleaseSummary =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as ReleaseSummary).version === 'string' &&
          Array.isArray((r as ReleaseSummary).highlights) &&
          (r as ReleaseSummary).highlights.every(h => typeof h === 'string') &&
          typeof (r as ReleaseSummary).more === 'number'
      )
    : [];
  return { version, releases: valid };
}

/**
 * The highlights of every release after `current` up to the update's
 * version, newest first, capped at `max` lines. `more` counts the changes
 * left out.
 */
export function highlightsSince(
  appData: UpdateAppData,
  current: string,
  max = 5
): { highlights: string[]; more: number } {
  const releases = appData.releases.filter(
    r =>
      isNewerVersion(r.version, current) &&
      !isNewerVersion(r.version, appData.version)
  );
  const all = releases.flatMap(r => r.highlights);
  const omitted = releases.reduce((sum, r) => sum + r.more, 0);
  return {
    highlights: all.slice(0, max),
    more: omitted + Math.max(0, all.length - max),
  };
}
