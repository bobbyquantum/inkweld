import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { ChangelogService, type ChangelogVersion } from './changelog.service';

describe('ChangelogService', () => {
  let service: ChangelogService;
  let httpClientMock: { get: ReturnType<typeof vi.fn> };

  const mockChangelogText = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- New feature coming soon

---

## [1.0.0] - 2025-01-01

### Added
- Initial release
- Core features

### Fixed
- Bug fixes

---

## [0.9.0] - 2024-12-01

### Added
- Beta feature

---
`;

  beforeEach(() => {
    httpClientMock = {
      get: vi.fn().mockReturnValue(of(mockChangelogText)),
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        ChangelogService,
        { provide: HttpClient, useValue: httpClientMock },
      ],
    });

    service = TestBed.inject(ChangelogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getChangelog', () => {
    it('should fetch and parse changelog from assets', async () => {
      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      expect(httpClientMock.get).toHaveBeenCalledWith('assets/CHANGELOG.md', {
        responseType: 'text',
      });
      expect(versions.length).toBeGreaterThan(0);
    });

    it('should parse unreleased version correctly', async () => {
      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      const unreleased = versions.find(v => v.version === 'Unreleased');
      expect(unreleased).toBeTruthy();
      expect(unreleased?.isUnreleased).toBe(true);
      expect(unreleased?.date).toBe('');
    });

    it('should parse released versions with dates', async () => {
      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      const v100 = versions.find(v => v.version === '1.0.0');
      expect(v100).toBeTruthy();
      expect(v100?.date).toBe('2025-01-01');
      expect(v100?.isUnreleased).toBe(false);
    });

    it('should convert markdown content to HTML', async () => {
      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      const v100 = versions.find(v => v.version === '1.0.0');
      expect(v100?.content).toContain('<h3>');
      expect(v100?.content).toContain('Added');
    });

    it('should handle empty changelog', async () => {
      httpClientMock.get.mockReturnValue(of('# Changelog\n\nNo changes yet.'));

      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      expect(versions).toEqual([]);
    });

    it('should parse multiple versions in order', async () => {
      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe('Unreleased');
      expect(versions[1].version).toBe('1.0.0');
      expect(versions[2].version).toBe('0.9.0');
    });

    it('should parse release-please version headings', async () => {
      httpClientMock.get.mockReturnValue(
        of(`# Changelog

## [1.1.0](https://github.com/o/r/compare/v1.0.1...v1.1.0) (2026-11-02)

### Features

* **editor:** something new

## 1.0.1 (2026-10-20)

### Bug Fixes

* a fix

## [1.0.0] - 2026-10-10

- Initial release
`)
      );

      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      expect(versions.map(v => [v.version, v.date])).toEqual([
        ['1.1.0', '2026-11-02'],
        ['1.0.1', '2026-10-20'],
        ['1.0.0', '2026-10-10'],
      ]);
      expect(versions[0].isUnreleased).toBe(false);
      expect(versions[0].content).toContain('Features');
    });

    it('should accept a release-please heading without a date', async () => {
      httpClientMock.get.mockReturnValue(
        of(
          '# Changelog\n\n## [2.0.0](https://example.com/compare)\n\n- Change\n'
        )
      );

      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('2.0.0');
      expect(versions[0].date).toBe('');
    });

    it('should skip headings that are not versions', async () => {
      httpClientMock.get.mockReturnValue(
        of('# Changelog\n\n## Notes\n\nNothing here.\n')
      );

      const versions = await new Promise<ChangelogVersion[]>(resolve => {
        service.getChangelog().subscribe(v => resolve(v));
      });

      expect(versions).toEqual([]);
    });
  });
});
