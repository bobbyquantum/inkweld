import {
  classifyUpdate,
  cleanHighlight,
  compareVersions,
  highlightsSince,
  isNewerVersion,
  parseVersion,
  parseVersionHeader,
  readUpdateAppData,
  splitChangelog,
  summarizeChangelog,
  type UpdateAppData,
} from './release-notes';

const RELEASE_PLEASE_CHANGELOG = `# Changelog

Preamble text.

## [1.0.0-beta.3](https://github.com/o/r/compare/v1.0.0-beta.2...v1.0.0-beta.3) (2026-11-02)


### Bug Fixes

* **sync:** retry uploads after a dropped connection ([#1702](https://github.com/o/r/issues/1702)) ([abc1234](https://github.com/o/r/commit/abc1234))


### Features

* **editor:** add a [word sprint](https://example.com) timer ([#1700](https://github.com/o/r/issues/1700)) ([def5678](https://github.com/o/r/commit/def5678))
* show \`reading time\` in the status bar ([#1701](https://github.com/o/r/issues/1701)) ([0123abc](https://github.com/o/r/commit/0123abc))

## [1.0.0-beta.2](https://github.com/o/r/compare/v1.0.0-beta.1...v1.0.0-beta.2) (2026-10-30)

### Bug Fixes

* **setup:** keep the username when upgrading ([#1670](https://github.com/o/r/issues/1670)) ([bbf06d3](https://github.com/o/r/commit/bbf06d3))

## [1.0.0-beta.1] - 2026-10-23

The first beta.

### Writing

- Rich-text editor with tables, images and links,
  wrapped onto a second line.
  - A nested detail that is skipped.
- Snapshots.

---
`;

describe('release-notes', () => {
  describe('parseVersion', () => {
    it('parses releases and pre-releases', () => {
      expect(parseVersion('1.2.3')).toEqual({
        core: [1, 2, 3],
        prerelease: [],
      });
      expect(parseVersion('v1.0.0-beta.4')).toEqual({
        core: [1, 0, 0],
        prerelease: ['beta', 4],
      });
      expect(parseVersion('1.0.0+build.5')?.prerelease).toEqual([]);
    });

    it('rejects anything else', () => {
      expect(parseVersion('Unreleased')).toBeNull();
      expect(parseVersion('1.0')).toBeNull();
    });
  });

  describe('compareVersions', () => {
    it.each([
      ['1.0.0-beta.2', '1.0.0-beta.1', 1],
      ['1.0.0-beta.10', '1.0.0-beta.9', 1],
      ['1.0.0', '1.0.0-beta.9', 1],
      ['1.0.0-rc.1', '1.0.0-beta.9', 1],
      ['1.0.0-beta', '1.0.0-beta.1', -1],
      ['1.0.0-1', '1.0.0-alpha', -1],
      ['1.1.0', '1.0.9', 1],
      ['2.0.0', '1.9.9', 1],
      ['1.0.0-beta.1', '1.0.0-beta.1', 0],
    ])('%s vs %s', (a, b, sign) => {
      expect(Math.sign(compareVersions(a, b) ?? Number.NaN)).toBe(sign);
    });

    it('returns null for unparseable versions', () => {
      expect(compareVersions('next', '1.0.0')).toBeNull();
      expect(isNewerVersion('next', '1.0.0')).toBe(false);
    });
  });

  describe('classifyUpdate', () => {
    it.each([
      ['1.0.0-beta.1', '1.0.0-beta.2', 'beta'],
      ['1.0.0-alpha.1', '1.0.0-alpha.2', 'alpha'],
      ['1.0.0-beta.9', '1.0.0-rc.1', 'rc'],
      ['1.0.0-beta.9', '1.0.0-next.1', 'prerelease'],
      ['1.0.0-beta.9', '1.0.0', 'stable'],
      ['1.0.0', '2.0.0', 'major'],
      ['1.0.0', '1.1.0', 'minor'],
      ['1.0.0', '1.0.1', 'patch'],
    ])('%s → %s is %s', (from, to, kind) => {
      expect(classifyUpdate(from, to)).toBe(kind);
    });

    it('returns null when the target is not newer', () => {
      expect(classifyUpdate('1.0.0-beta.2', '1.0.0-beta.2')).toBeNull();
      expect(classifyUpdate('1.0.0', '1.0.0-beta.2')).toBeNull();
      expect(classifyUpdate('1.0.0', 'garbage')).toBeNull();
    });
  });

  describe('parseVersionHeader', () => {
    it('reads every supported heading style', () => {
      expect(parseVersionHeader('[1.0.0] - 2025-01-01')).toEqual({
        version: '1.0.0',
        date: '2025-01-01',
      });
      expect(parseVersionHeader('[Unreleased]')).toEqual({
        version: 'Unreleased',
        date: '',
      });
      expect(
        parseVersionHeader(
          '[1.0.1](https://x/compare/v1.0.0...v1.0.1) (2026-10-10)'
        )
      ).toEqual({ version: '1.0.1', date: '2026-10-10' });
      expect(parseVersionHeader('1.0.1 (2026-10-10)')).toEqual({
        version: '1.0.1',
        date: '2026-10-10',
      });
      expect(parseVersionHeader('Notes')).toBeNull();
    });
  });

  describe('splitChangelog', () => {
    it('splits sections newest first and drops trailing rules', () => {
      const sections = splitChangelog(RELEASE_PLEASE_CHANGELOG);
      expect(sections.map(s => s.version)).toEqual([
        '1.0.0-beta.3',
        '1.0.0-beta.2',
        '1.0.0-beta.1',
      ]);
      expect(sections[2].markdown.endsWith('---')).toBe(false);
    });
  });

  describe('cleanHighlight', () => {
    it('strips the scope, PR and commit links and Markdown', () => {
      expect(
        cleanHighlight(
          '**editor:** add a [word sprint](https://e.com) timer ([#1](https://x/1)) ([abc](https://x/c/abc))'
        )
      ).toBe('Add a word sprint timer');
      expect(cleanHighlight('show `reading time` in **bold**')).toBe(
        'Show reading time in bold'
      );
    });

    it('strips the scope emoji with the scope', () => {
      expect(cleanHighlight('📝 **editor:** keep the cursor')).toBe(
        'Keep the cursor'
      );
      expect(cleanHighlight('☁️ **cloud-sync:** retry uploads')).toBe(
        'Retry uploads'
      );
    });

    it('shortens long lines at a word boundary', () => {
      const long = `${'word '.repeat(40)}end`;
      const cleaned = cleanHighlight(long);
      expect(cleaned.length).toBeLessThanOrEqual(120);
      expect(cleaned.endsWith('Word…') || cleaned.endsWith('word…')).toBe(true);
    });
  });

  describe('summarizeChangelog', () => {
    it('lists features before fixes and counts the rest', () => {
      const [beta3, beta2, beta1] = summarizeChangelog(
        RELEASE_PLEASE_CHANGELOG,
        { maxHighlights: 2 }
      );
      expect(beta3).toEqual({
        version: '1.0.0-beta.3',
        highlights: [
          'Add a word sprint timer',
          'Show reading time in the status bar',
        ],
        more: 1,
      });
      expect(beta2.highlights).toEqual(['Keep the username when upgrading']);
      expect(beta1.highlights).toEqual([
        'Rich-text editor with tables, images and links, wrapped onto a second line.',
        'Snapshots.',
      ]);
    });

    it('skips non-version sections and caps the release count', () => {
      const text = `## [Unreleased]\n\n- wip\n\n${RELEASE_PLEASE_CHANGELOG}`;
      const releases = summarizeChangelog(text, { maxReleases: 2 });
      expect(releases.map(r => r.version)).toEqual([
        '1.0.0-beta.3',
        '1.0.0-beta.2',
      ]);
    });
  });

  describe('readUpdateAppData', () => {
    it('accepts the shape the build writes', () => {
      const data = {
        version: '1.0.0-beta.3',
        releases: [{ version: '1.0.0-beta.3', highlights: ['A'], more: 0 }],
      };
      expect(readUpdateAppData(data)).toEqual(data);
    });

    it('drops malformed releases and rejects other values', () => {
      expect(
        readUpdateAppData({
          version: '1.0.0',
          releases: [{ version: '1.0.0', highlights: [1], more: 0 }, null],
        })
      ).toEqual({ version: '1.0.0', releases: [] });
      expect(readUpdateAppData({ version: '1.0.0' })).toEqual({
        version: '1.0.0',
        releases: [],
      });
      expect(readUpdateAppData(undefined)).toBeNull();
      expect(readUpdateAppData({ version: 'latest' })).toBeNull();
    });
  });

  describe('highlightsSince', () => {
    const appData: UpdateAppData = {
      version: '1.0.0-beta.3',
      releases: [
        { version: '1.0.0-beta.4', highlights: ['Future'], more: 0 },
        { version: '1.0.0-beta.3', highlights: ['C1', 'C2'], more: 2 },
        { version: '1.0.0-beta.2', highlights: ['B1', 'B2', 'B3'], more: 0 },
        { version: '1.0.0-beta.1', highlights: ['A1'], more: 9 },
      ],
    };

    it('covers every release after the running one', () => {
      expect(highlightsSince(appData, '1.0.0-beta.1', 4)).toEqual({
        highlights: ['C1', 'C2', 'B1', 'B2'],
        more: 3,
      });
    });

    it('covers only the newest release for a one-step update', () => {
      expect(highlightsSince(appData, '1.0.0-beta.2')).toEqual({
        highlights: ['C1', 'C2'],
        more: 2,
      });
    });
  });
});
