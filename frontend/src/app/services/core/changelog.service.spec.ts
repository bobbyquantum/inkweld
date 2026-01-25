import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ChangelogService, ChangelogVersion } from './changelog.service';

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

      expect(versions.length).toBe(3);
      expect(versions[0].version).toBe('Unreleased');
      expect(versions[1].version).toBe('1.0.0');
      expect(versions[2].version).toBe('0.9.0');
    });
  });
});
