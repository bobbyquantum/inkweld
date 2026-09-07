import { signal } from '@angular/core';
import type { CoverSource } from '@models/cover-source';
import type { CoverSourceStatus } from '@services/project/cover-source.service';
import { vi } from 'vitest';

/**
 * Test double for {@link CoverSourceService}. Specs that mock
 * ProjectStateService need this too, because the real service reads the
 * `coverSource` signal off project state at construction.
 */
export function createCoverSourceMock() {
  return {
    source: signal<CoverSource | undefined>(undefined),
    status: signal<CoverSourceStatus>('idle'),
    lastError: signal<string | null>(null),
    isCoverFrame: vi.fn(() => false),
    link: vi.fn(() => Promise.resolve(true)),
    unlink: vi.fn(),
    notifyCanvasChanged: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    freshCoverBlob: vi.fn(() => Promise.resolve<Blob | null>(null)),
  };
}

export type CoverSourceMock = ReturnType<typeof createCoverSourceMock>;
