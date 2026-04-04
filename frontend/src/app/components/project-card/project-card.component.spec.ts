import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  type ProjectSyncStatus,
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

  describe('long-press detection', () => {
    it('should attach pointer event listeners on AfterViewInit', () => {
      // Destroy and recreate to test AfterViewInit
      const newFixture = TestBed.createComponent(ProjectCardComponent);
      const newEl = newFixture.nativeElement as HTMLElement;
      const addSpy = vi.spyOn(newEl, 'addEventListener');
      newFixture.componentInstance.project = mockProject;
      newFixture.detectChanges();

      expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith(
        'pointercancel',
        expect.any(Function)
      );

      newFixture.destroy();
    });

    it('should emit longPress after holding for 500ms', () => {
      vi.useFakeTimers();
      const longPressSpy = vi.spyOn(component.longPress, 'emit');
      const el = fixture.nativeElement as HTMLElement;

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      vi.advanceTimersByTime(500);

      expect(longPressSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should not emit longPress if pointer is released before 500ms', () => {
      vi.useFakeTimers();
      const longPressSpy = vi.spyOn(component.longPress, 'emit');
      const el = fixture.nativeElement as HTMLElement;

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      vi.advanceTimersByTime(200);
      el.dispatchEvent(new PointerEvent('pointerup'));
      vi.advanceTimersByTime(500);

      expect(longPressSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should cancel long-press if pointer moves beyond threshold', () => {
      vi.useFakeTimers();
      const longPressSpy = vi.spyOn(component.longPress, 'emit');
      const el = fixture.nativeElement as HTMLElement;

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      // Move more than 10px away
      el.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 120, clientY: 100 })
      );
      vi.advanceTimersByTime(500);

      expect(longPressSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should not cancel long-press for small pointer movements', () => {
      vi.useFakeTimers();
      const longPressSpy = vi.spyOn(component.longPress, 'emit');
      const el = fixture.nativeElement as HTMLElement;

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      // Move less than 10px
      el.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 105, clientY: 103 })
      );
      vi.advanceTimersByTime(500);

      expect(longPressSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should cancel long-press on pointercancel', () => {
      vi.useFakeTimers();
      const longPressSpy = vi.spyOn(component.longPress, 'emit');
      const el = fixture.nativeElement as HTMLElement;

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      el.dispatchEvent(new PointerEvent('pointercancel'));
      vi.advanceTimersByTime(500);

      expect(longPressSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should report wasLongPress() as true after long-press fires', () => {
      vi.useFakeTimers();
      const el = fixture.nativeElement as HTMLElement;

      expect(component.wasLongPress()).toBe(false);

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      vi.advanceTimersByTime(500);

      expect(component.wasLongPress()).toBe(true);
      vi.useRealTimers();
    });

    it('should reset wasLongPress on next pointerdown', () => {
      vi.useFakeTimers();
      const el = fixture.nativeElement as HTMLElement;

      // Trigger first long-press
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      vi.advanceTimersByTime(500);
      expect(component.wasLongPress()).toBe(true);

      // New pointerdown resets it
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          isPrimary: true,
        })
      );
      expect(component.wasLongPress()).toBe(false);
      vi.useRealTimers();
    });

    it('should remove event listeners on destroy', () => {
      const el = fixture.nativeElement as HTMLElement;
      const removeSpy = vi.spyOn(el, 'removeEventListener');

      fixture.destroy();

      expect(removeSpy).toHaveBeenCalledWith(
        'pointerdown',
        expect.any(Function)
      );
      expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith(
        'pointermove',
        expect.any(Function)
      );
      expect(removeSpy).toHaveBeenCalledWith(
        'pointercancel',
        expect.any(Function)
      );
    });

    it('should not attach listeners twice if attachLongPressListeners is called again', () => {
      const el = fixture.nativeElement as HTMLElement;
      const addSpy = vi.spyOn(el, 'addEventListener');

      // Call it again (already called in ngAfterViewInit)
      (component as any).attachLongPressListeners();

      // Should not add any new listeners since they're already attached
      expect(addSpy).not.toHaveBeenCalled();
    });
  });

  describe('deactivated state', () => {
    it('should default isActivated to true', () => {
      expect(component.isActivated).toBe(true);
    });

    it('should accept isActivated input as false', () => {
      fixture.componentRef.setInput('isActivated', false);
      fixture.detectChanges();

      expect(component.isActivated).toBe(false);
    });
  });
});
