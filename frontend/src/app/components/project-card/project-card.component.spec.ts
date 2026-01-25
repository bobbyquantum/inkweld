import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ProjectSyncStatus,
  SyncQueueService,
  SyncStage,
} from '@services/sync/sync-queue.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectCardComponent } from './project-card.component';

describe('ProjectCardComponent', () => {
  let component: ProjectCardComponent;
  let fixture: ComponentFixture<ProjectCardComponent>;
  let mockSyncQueueService: {
    getProjectStatus: ReturnType<typeof vi.fn>;
    isProjectSyncing: ReturnType<typeof vi.fn>;
    statusVersion: ReturnType<typeof signal<number>>;
  };

  const mockProject = {
    id: 'test-id',
    slug: 'test-project',
    title: 'Test Project',
    description: 'A test project',
    username: 'testuser',
    coverImage: null,
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  beforeEach(async () => {
    mockSyncQueueService = {
      getProjectStatus: vi.fn().mockReturnValue(undefined),
      isProjectSyncing: vi.fn().mockReturnValue(false),
      statusVersion: signal(0),
    };

    await TestBed.configureTestingModule({
      imports: [ProjectCardComponent, NoopAnimationsModule],
      providers: [
        { provide: SyncQueueService, useValue: mockSyncQueueService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectCardComponent);
    component = fixture.componentInstance;
    component.project = mockProject;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display project cover', () => {
    const coverElement =
      fixture.nativeElement.querySelector('app-project-cover');
    expect(coverElement).toBeTruthy();
  });

  describe('sync overlay', () => {
    it('should not show sync overlay when no sync status', () => {
      const overlay = fixture.nativeElement.querySelector('.sync-overlay');
      expect(overlay).toBeNull();
    });

    it('should show sync overlay when project is queued', () => {
      const statusSignal = signal<ProjectSyncStatus>({
        projectKey: 'testuser/test-project',
        projectId: 'test-id',
        stage: SyncStage.Queued,
        progress: 0,
      });
      mockSyncQueueService.getProjectStatus.mockReturnValue(statusSignal);

      fixture.componentRef.setInput('projectKey', 'testuser/test-project');
      fixture.detectChanges();

      expect(component.isQueued()).toBe(true);
      expect(component.syncStageLabel()).toBe('Waiting...');
    });

    it('should show syncing state during metadata sync', () => {
      const statusSignal = signal<ProjectSyncStatus>({
        projectKey: 'testuser/test-project',
        projectId: 'test-id',
        stage: SyncStage.Metadata,
        progress: 50,
      });
      mockSyncQueueService.getProjectStatus.mockReturnValue(statusSignal);

      fixture.componentRef.setInput('projectKey', 'testuser/test-project');
      fixture.detectChanges();

      expect(component.isSyncing()).toBe(true);
      expect(component.syncStageLabel()).toBe('Syncing metadata...');
    });

    it('should show completed state after sync', () => {
      const statusSignal = signal<ProjectSyncStatus>({
        projectKey: 'testuser/test-project',
        projectId: 'test-id',
        stage: SyncStage.Completed,
        progress: 100,
      });
      mockSyncQueueService.getProjectStatus.mockReturnValue(statusSignal);

      fixture.componentRef.setInput('projectKey', 'testuser/test-project');
      fixture.detectChanges();

      expect(component.isSynced()).toBe(true);
      expect(component.syncStageLabel()).toBe('Synced!');
    });

    it('should show failed state with error message', () => {
      const statusSignal = signal<ProjectSyncStatus>({
        projectKey: 'testuser/test-project',
        projectId: 'test-id',
        stage: SyncStage.Failed,
        progress: 0,
        error: 'Network error',
      });
      mockSyncQueueService.getProjectStatus.mockReturnValue(statusSignal);

      fixture.componentRef.setInput('projectKey', 'testuser/test-project');
      fixture.detectChanges();

      expect(component.hasFailed()).toBe(true);
      expect(component.syncStageLabel()).toBe('Network error');
    });

    it('should show correct labels for each sync stage', () => {
      const stages: [SyncStage, string][] = [
        [SyncStage.Queued, 'Waiting...'],
        [SyncStage.Metadata, 'Syncing metadata...'],
        [SyncStage.Elements, 'Syncing structure...'],
        [SyncStage.Documents, 'Syncing documents...'],
        [SyncStage.Media, 'Syncing media...'],
        [SyncStage.Worldbuilding, 'Syncing worldbuilding...'],
        [SyncStage.Completed, 'Synced!'],
      ];

      for (let i = 0; i < stages.length; i++) {
        const [stage, expectedLabel] = stages[i];
        const projectKey = `testuser/test-project-${i}`;
        const statusSignal = signal<ProjectSyncStatus>({
          projectKey,
          projectId: 'test-id',
          stage,
          progress: 50,
        });
        mockSyncQueueService.getProjectStatus.mockReturnValue(statusSignal);

        fixture.componentRef.setInput('projectKey', projectKey);
        fixture.detectChanges();

        expect(component.syncStageLabel()).toBe(expectedLabel);
      }
    });
  });

  describe('shared badge', () => {
    it('should not show shared badge by default', () => {
      const badge = fixture.nativeElement.querySelector('.shared-badge');
      expect(badge).toBeNull();
    });

    it('should show shared badge when isShared is true', async () => {
      // Need to set the value and detect changes in a stable way
      fixture.componentRef.setInput('isShared', true);
      fixture.componentRef.setInput('sharedByUsername', 'otheruser');
      fixture.detectChanges();
      await fixture.whenStable();

      const badge = fixture.nativeElement.querySelector('.shared-badge');
      expect(badge).toBeTruthy();
    });
  });
});
