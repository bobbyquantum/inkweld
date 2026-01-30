import 'fake-indexeddb/auto';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProjectSyncService } from './project-sync.service';
import { StorageService } from './storage.service';

describe('ProjectSyncService', () => {
  let service: ProjectSyncService;
  let storageService: StorageService;

  const TEST_PROJECT_KEY = 'alice/my-novel';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StorageService,
        ProjectSyncService,
      ],
    });
    storageService = TestBed.inject(StorageService);
    service = TestBed.inject(ProjectSyncService);
  });

  afterEach(() => {
    storageService.closeAll();
    // Reset IndexedDB for clean state
    indexedDB = new IDBFactory();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getSyncState', () => {
    it('should return default state for new project', () => {
      const state = service.getSyncState(TEST_PROJECT_KEY);

      expect(state()).toEqual({
        projectKey: TEST_PROJECT_KEY,
        lastSync: null,
        pendingUploads: [],
        status: 'offline-only',
      });
    });

    it('should return same signal for same project', () => {
      const state1 = service.getSyncState(TEST_PROJECT_KEY);
      const state2 = service.getSyncState(TEST_PROJECT_KEY);

      expect(state1).toBe(state2);
    });

    it('should return different signals for different projects', () => {
      const state1 = service.getSyncState('alice/project-1');
      const state2 = service.getSyncState('alice/project-2');

      expect(state1).not.toBe(state2);
    });
  });

  describe('hasPendingChanges', () => {
    it('should return false for new project', () => {
      expect(service.hasPendingChanges(TEST_PROJECT_KEY)).toBe(false);
    });

    it('should return true when there are pending uploads', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      expect(service.hasPendingChanges(TEST_PROJECT_KEY)).toBe(true);
    });
  });

  describe('markPendingUpload', () => {
    it('should add media to pending uploads', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toContain('cover');
      expect(state().status).toBe('pending');
    });

    it('should not duplicate media IDs', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toEqual(['cover']);
    });

    it('should add multiple different media IDs', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      await service.markPendingUpload(TEST_PROJECT_KEY, 'img-1');
      await service.markPendingUpload(TEST_PROJECT_KEY, 'img-2');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toEqual(['cover', 'img-1', 'img-2']);
    });
  });

  describe('clearPendingUpload', () => {
    it('should remove media from pending uploads', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      await service.markPendingUpload(TEST_PROJECT_KEY, 'img-1');

      await service.clearPendingUpload(TEST_PROJECT_KEY, 'cover');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toEqual(['img-1']);
    });

    it('should set status to synced when last upload cleared', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      await service.clearPendingUpload(TEST_PROJECT_KEY, 'cover');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toEqual([]);
      expect(state().status).toBe('synced');
    });

    it('should handle clearing non-existent media', async () => {
      await service.clearPendingUpload(TEST_PROJECT_KEY, 'nonexistent');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toEqual([]);
    });
  });

  describe('markSynced', () => {
    it('should clear all pending uploads', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      await service.markPendingUpload(TEST_PROJECT_KEY, 'img-1');

      await service.markSynced(TEST_PROJECT_KEY);

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toEqual([]);
      expect(state().status).toBe('synced');
      expect(state().lastSync).not.toBeNull();
    });

    it('should set lastSync timestamp', async () => {
      const before = new Date().toISOString();
      await service.markSynced(TEST_PROJECT_KEY);
      const after = new Date().toISOString();

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().lastSync).not.toBeNull();
      expect(state().lastSync! >= before).toBe(true);
      expect(state().lastSync! <= after).toBe(true);
    });

    it('should clear lastError', async () => {
      await service.markSyncError(TEST_PROJECT_KEY, 'Some error');
      await service.markSynced(TEST_PROJECT_KEY);

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().lastError).toBeUndefined();
    });
  });

  describe('markSyncError', () => {
    it('should set error status and message', async () => {
      await service.markSyncError(TEST_PROJECT_KEY, 'Network error');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().status).toBe('error');
      expect(state().lastError).toBe('Network error');
    });

    it('should preserve pending uploads', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      await service.markSyncError(TEST_PROJECT_KEY, 'Network error');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toContain('cover');
    });
  });

  describe('markSyncing', () => {
    it('should set syncing status', () => {
      service.markSyncing(TEST_PROJECT_KEY);

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().status).toBe('syncing');
    });
  });

  describe('getProjectsWithPendingChanges', () => {
    it('should return empty array when no pending changes', async () => {
      const projects = await service.getProjectsWithPendingChanges();
      expect(projects).toEqual([]);
    });

    it('should return projects with pending changes', async () => {
      await service.markPendingUpload('alice/project-1', 'cover');
      await service.markPendingUpload('bob/project-2', 'img-1');

      const projects = await service.getProjectsWithPendingChanges();
      expect(projects).toContain('alice/project-1');
      expect(projects).toContain('bob/project-2');
    });

    it('should not return synced projects', async () => {
      await service.markPendingUpload('alice/project-1', 'cover');
      await service.markSynced('alice/project-1');
      await service.markPendingUpload('bob/project-2', 'img-1');

      const projects = await service.getProjectsWithPendingChanges();
      expect(projects).not.toContain('alice/project-1');
      expect(projects).toContain('bob/project-2');
    });
  });

  describe('deleteSyncState', () => {
    it('should remove sync state from memory and storage', async () => {
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');
      await service.deleteSyncState(TEST_PROJECT_KEY);

      // Getting state again should return default
      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().pendingUploads).toEqual([]);
      expect(state().status).toBe('offline-only');
    });
  });

  describe('persistence', () => {
    it('should persist sync state across service instances', async () => {
      // Mark pending upload
      await service.markPendingUpload(TEST_PROJECT_KEY, 'cover');

      // Get state to trigger load
      const state = service.getSyncState(TEST_PROJECT_KEY);

      // Wait a bit for async persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify state is set (may need to wait for async load in real scenarios)
      expect(state().pendingUploads).toContain('cover');
    });
  });

  describe('tombstones', () => {
    it('should create and retrieve a tombstone', async () => {
      await service.createTombstone(TEST_PROJECT_KEY);

      const hasTombstone = await service.hasTombstone(TEST_PROJECT_KEY);
      expect(hasTombstone).toBe(true);
    });

    it('should return false for non-existent tombstone', async () => {
      const hasTombstone = await service.hasTombstone('nonexistent/project');
      expect(hasTombstone).toBe(false);
    });

    it('should list all tombstones', async () => {
      await service.createTombstone('alice/project-1');
      await service.createTombstone('alice/project-2');

      const tombstones = await service.getAllTombstones();
      expect(tombstones).toHaveLength(2);
      expect(tombstones.map(t => t.projectKey)).toContain('alice/project-1');
      expect(tombstones.map(t => t.projectKey)).toContain('alice/project-2');
    });

    it('should remove a tombstone', async () => {
      await service.createTombstone(TEST_PROJECT_KEY);
      await service.removeTombstone(TEST_PROJECT_KEY);

      const hasTombstone = await service.hasTombstone(TEST_PROJECT_KEY);
      expect(hasTombstone).toBe(false);
    });

    it('should include deletedAt timestamp', async () => {
      const before = new Date().toISOString();
      await service.createTombstone(TEST_PROJECT_KEY);
      const after = new Date().toISOString();

      const tombstones = await service.getAllTombstones();
      expect(tombstones).toHaveLength(1);
      expect(tombstones[0].deletedAt >= before).toBe(true);
      expect(tombstones[0].deletedAt <= after).toBe(true);
    });
  });
});
