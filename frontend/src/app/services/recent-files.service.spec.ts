import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from './logger.service';
import { RecentFilesService } from './recent-files.service';
import { SettingsService } from './settings.service';

describe('RecentFilesService', () => {
  let service: RecentFilesService;
  let settingsService: SettingsService;
  let settingsStorageMock: Record<string, unknown> = {};

  beforeEach(() => {
    settingsStorageMock = {};

    // Create mock settings service
    const mockSettingsService = {
      getSetting: vi.fn((key: string, defaultValue: unknown) => {
        return settingsStorageMock[key] || defaultValue;
      }),
      setSetting: vi.fn((key: string, value: unknown) => {
        settingsStorageMock[key] = value;
      }),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Set up TestBed
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        RecentFilesService,
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    });

    service = TestBed.inject(RecentFilesService);
    settingsService = TestBed.inject(SettingsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should add a file to recent files', () => {
    const mockFile: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: 'file1',
      name: 'Test File',
      type: 'ITEM',
      level: 0,
      expandable: false,
      position: 0,
      version: 1,
      metadata: {},
    };

    service.addRecentFile(mockFile, 'user', 'slug');

    const recentFiles = service.recentFiles();
    expect(recentFiles.length).toBe(1);
    expect(recentFiles[0].id).toBe('file1');
    expect(recentFiles[0].name).toBe('Test File');
    expect(recentFiles[0].projectSlug).toBe('slug');
    expect(settingsService.setSetting).toHaveBeenCalled();
  });

  it('should move existing file to the top when added again', () => {
    // Add first file
    const file1: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: 'file1',
      name: 'File 1',
      type: 'ITEM',
      level: 0,
      expandable: false,
      position: 0,
      version: 1,
      metadata: {},
    };

    // Add second file
    const file2: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: 'file2',
      name: 'File 2',
      type: 'ITEM',
      level: 0,
      expandable: false,
      position: 1,
      version: 1,
      metadata: {},
    };

    service.addRecentFile(file1, 'user', 'slug1');
    service.addRecentFile(file2, 'user', 'slug1');

    // Verify order: file2, file1
    let recentFiles = service.recentFiles();
    expect(recentFiles.length).toBe(2);
    expect(recentFiles[0].id).toBe('file2');
    expect(recentFiles[1].id).toBe('file1');

    // Add file1 again
    service.addRecentFile(file1, 'user', 'slug1');

    // Verify new order: file1, file2
    recentFiles = service.recentFiles();
    expect(recentFiles.length).toBe(2);
    expect(recentFiles[0].id).toBe('file1');
    expect(recentFiles[1].id).toBe('file2');
  });

  it('should filter files by project ID', () => {
    const file1: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: 'file1',
      name: 'File 1',
      type: 'ITEM',
      level: 0,
      expandable: false,
      position: 0,
      version: 1,
      metadata: {},
    };

    const file2: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: 'file2',
      name: 'File 2',
      type: 'ITEM',
      level: 0,
      expandable: false,
      position: 1,
      version: 1,
      metadata: {},
    };

    service.addRecentFile(file1, 'user', 'slug1');
    service.addRecentFile(file2, 'user', 'slug2');

    const project1Files = service.getRecentFilesForProject('user', 'slug1');
    expect(project1Files.length).toBe(1);
    expect(project1Files[0].id).toBe('file1');

    const project2Files = service.getRecentFilesForProject('user', 'slug2');
    expect(project2Files.length).toBe(1);
    expect(project2Files[0].id).toBe('file2');
  });

  it('should limit the number of recent files', () => {
    // Add MAX_RECENT_FILES + 1 files
    for (let i = 0; i < 11; i++) {
      const file: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
        id: `file${i}`,
        name: `File ${i}`,
        type: 'ITEM',
        level: 0,
        expandable: false,
        position: i,
        version: 1,
        metadata: {},
      };
      service.addRecentFile(file, 'user', 'slug');
    }

    // Should only keep the 10 most recent
    const recentFiles = service.recentFiles();
    expect(recentFiles.length).toBe(10);
    expect(recentFiles[0].id).toBe('file10'); // Most recent
    expect(recentFiles[9].id).toBe('file1'); // Least recent (file0 was dropped)
  });

  it('should clear all recent files', () => {
    const file: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: 'file1',
      name: 'Test File',
      type: 'ITEM',
      level: 0,
      expandable: false,
      position: 0,
      version: 1,
      metadata: {},
    };

    // Reset the mock before this specific test
    vi.clearAllMocks();

    service.addRecentFile(file, 'user', 'slug');
    expect(service.recentFiles().length).toBe(1);

    service.clearRecentFiles();
    expect(service.recentFiles().length).toBe(0);
    expect(settingsService.setSetting).toHaveBeenCalled();
  });
});
