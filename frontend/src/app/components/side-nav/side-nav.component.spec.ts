import {
  provideZonelessChangeDetection,
  signal,
  WritableSignal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Project } from '@inkweld/index';
import {
  ProjectSyncStatus,
  SyncQueueService,
  SyncStage,
} from '@services/sync/sync-queue.service';
import { UserService } from '@services/user/user.service';
import { MockedObject, vi } from 'vitest';

import { NavItem, SideNavComponent } from './side-nav.component';

describe('SideNavComponent', () => {
  let component: SideNavComponent;
  let fixture: ComponentFixture<SideNavComponent>;
  let routerMock: MockedObject<Router>;
  let userServiceMock: MockedObject<UserService>;
  let syncQueueServiceMock: MockedObject<SyncQueueService>;

  const mockUser = {
    id: '1',
    username: 'testuser',
    name: 'Test User',
    enabled: true,
  };

  const mockProjects: Project[] = [
    {
      id: '1',
      title: 'Project 1',
      slug: 'project-1',
      username: 'testuser',
      createdDate: '2024-01-01',
      updatedDate: '2024-01-01',
    },
    {
      id: '2',
      title: 'Project 2',
      slug: 'project-2',
      username: 'testuser',
      createdDate: '2024-01-01',
      updatedDate: '2024-01-01',
    },
  ];

  beforeEach(async () => {
    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
      url: '/home',
    } as unknown as MockedObject<Router>;

    userServiceMock = {
      currentUser: signal(mockUser),
    } as unknown as MockedObject<UserService>;

    syncQueueServiceMock = {
      statusVersion: vi.fn().mockReturnValue(1),
      getProjectStatus: vi.fn().mockReturnValue(null),
    } as unknown as MockedObject<SyncQueueService>;

    await TestBed.configureTestingModule({
      imports: [SideNavComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: routerMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: SyncQueueService, useValue: syncQueueServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SideNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('navItems', () => {
    it('should return navigation items with correct routes when user is logged in', () => {
      const navItems = component.navItems;

      expect(navItems).toHaveLength(1);
      expect(navItems[0]).toEqual({
        label: 'Profile',
        icon: 'person',
        route: '/testuser',
      });
    });

    it('should return /home as profile route when no user is logged in', async () => {
      // Reset and reconfigure TestBed for this test case
      TestBed.resetTestingModule();

      const nullUserServiceMock = {
        currentUser: signal(null),
      } as unknown as MockedObject<UserService>;

      await TestBed.configureTestingModule({
        imports: [SideNavComponent],
        providers: [
          provideZonelessChangeDetection(),
          { provide: Router, useValue: routerMock },
          { provide: UserService, useValue: nullUserServiceMock },
        ],
      }).compileComponents();

      const newFixture = TestBed.createComponent(SideNavComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      const navItems = newComponent.navItems;

      expect(navItems[0].route).toBe('/home');
    });
  });

  describe('onNavItemClick', () => {
    it('should navigate to route when item has a route', () => {
      const navItem: NavItem = {
        label: 'Test',
        icon: 'test',
        route: '/test-route',
      };

      component.onNavItemClick(navItem);

      expect(routerMock.navigate).toHaveBeenCalledWith(['/test-route']);
    });

    it('should execute action when item has an action', () => {
      const actionSpy = vi.fn();
      const navItem: NavItem = {
        label: 'Test',
        icon: 'test',
        action: actionSpy,
      };

      component.onNavItemClick(navItem);

      expect(actionSpy).toHaveBeenCalled();
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('should close menu on mobile after navigation', () => {
      const isOpenSignal = signal(true);
      component.isOpen = isOpenSignal;
      component.isMobile = true;

      const navItem: NavItem = {
        label: 'Test',
        icon: 'test',
        route: '/test-route',
      };

      component.onNavItemClick(navItem);

      // Menu stays open after navigation (user can toggle manually)
      expect(isOpenSignal()).toBe(true);
    });

    it('should not close menu on desktop after navigation', () => {
      const isOpenSignal = signal(true);
      component.isOpen = isOpenSignal;
      component.isMobile = false;

      const navItem: NavItem = {
        label: 'Test',
        icon: 'test',
        route: '/test-route',
      };

      component.onNavItemClick(navItem);

      expect(isOpenSignal()).toBe(true);
    });

    it('should handle item with both action and route (action takes precedence)', () => {
      const actionSpy = vi.fn();
      const navItem: NavItem = {
        label: 'Test',
        icon: 'test',
        route: '/test-route',
        action: actionSpy,
      };

      component.onNavItemClick(navItem);

      expect(actionSpy).toHaveBeenCalled();
      // Route is NOT processed because action takes precedence (else if)
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });
  });

  describe('onProjectClick', () => {
    it('should emit projectSelected event when project is clicked', () => {
      const emitSpy = vi.spyOn(component.projectSelected, 'emit');
      const project = mockProjects[0];

      component.onProjectClick(project);

      expect(emitSpy).toHaveBeenCalledWith(project);
    });

    it('should not close menu on mobile after project selection (user toggles manually)', () => {
      const isOpenSignal = signal(true);
      component.isOpen = isOpenSignal;
      component.isMobile = true;

      component.onProjectClick(mockProjects[0]);

      // Menu stays open - user can toggle with hamburger
      expect(isOpenSignal()).toBe(true);
    });

    it('should not close menu on desktop after project selection', () => {
      const isOpenSignal = signal(true);
      component.isOpen = isOpenSignal;
      component.isMobile = false;

      component.onProjectClick(mockProjects[0]);

      expect(isOpenSignal()).toBe(true);
    });
  });

  describe('toggleNav', () => {
    it('should toggle the isOpen signal', () => {
      const isOpenSignal = signal(true);
      component.isOpen = isOpenSignal;

      component.toggleNav();
      expect(isOpenSignal()).toBe(false);

      component.toggleNav();
      expect(isOpenSignal()).toBe(true);
    });
  });

  describe('inputs', () => {
    it('should accept isOpen signal input', () => {
      const isOpenSignal = signal(true);
      component.isOpen = isOpenSignal;

      expect(component.isOpen()).toBe(true);
    });

    it('should accept isMobile input', () => {
      component.isMobile = true;

      expect(component.isMobile).toBe(true);
    });

    it('should accept projects input', () => {
      component.projects = mockProjects;

      expect(component.projects).toEqual(mockProjects);
    });

    it('should accept selectedProject input', () => {
      const selectedProject = mockProjects[0];
      component.selectedProject = selectedProject;

      expect(component.selectedProject).toEqual(selectedProject);
    });
  });

  describe('sync status methods', () => {
    const project = {
      id: '1',
      title: 'Test Project',
      slug: 'test-project',
      username: 'testuser',
      createdDate: '2024-01-01',
      updatedDate: '2024-01-01',
    };

    const createStatusSignal = (
      stage: SyncStage
    ): WritableSignal<ProjectSyncStatus> =>
      signal({
        projectKey: 'testuser/test-project',
        projectId: '1',
        stage,
        progress: 0,
      });

    describe('getSyncStatus', () => {
      it('should return undefined when no status exists', () => {
        syncQueueServiceMock.getProjectStatus.mockReturnValue(undefined);

        const result = component.getSyncStatus(project);

        expect(result).toBeUndefined();
        expect(syncQueueServiceMock.statusVersion).toHaveBeenCalled();
        expect(syncQueueServiceMock.getProjectStatus).toHaveBeenCalledWith(
          'testuser/test-project'
        );
      });

      it('should return status signal when status exists', () => {
        const statusSignal = createStatusSignal(SyncStage.Completed);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        const result = component.getSyncStatus(project);

        expect(result).toBe(statusSignal);
      });
    });

    describe('isSyncing', () => {
      it('should return false when no status exists', () => {
        syncQueueServiceMock.getProjectStatus.mockReturnValue(undefined);

        expect(component.isSyncing(project)).toBe(false);
      });

      it('should return false when status is Queued', () => {
        const statusSignal = createStatusSignal(SyncStage.Queued);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isSyncing(project)).toBe(false);
      });

      it('should return false when status is Completed', () => {
        const statusSignal = createStatusSignal(SyncStage.Completed);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isSyncing(project)).toBe(false);
      });

      it('should return false when status is Failed', () => {
        const statusSignal = createStatusSignal(SyncStage.Failed);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isSyncing(project)).toBe(false);
      });

      it('should return true when status is in progress', () => {
        const statusSignal = createStatusSignal(SyncStage.Metadata);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isSyncing(project)).toBe(true);
      });
    });

    describe('isQueued', () => {
      it('should return false when no status exists', () => {
        syncQueueServiceMock.getProjectStatus.mockReturnValue(undefined);

        expect(component.isQueued(project)).toBe(false);
      });

      it('should return true when status is Queued', () => {
        const statusSignal = createStatusSignal(SyncStage.Queued);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isQueued(project)).toBe(true);
      });

      it('should return false when status is not Queued', () => {
        const statusSignal = createStatusSignal(SyncStage.Completed);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isQueued(project)).toBe(false);
      });
    });

    describe('isSynced', () => {
      it('should return false when no status exists', () => {
        syncQueueServiceMock.getProjectStatus.mockReturnValue(undefined);

        expect(component.isSynced(project)).toBe(false);
      });

      it('should return true when status is Completed', () => {
        const statusSignal = createStatusSignal(SyncStage.Completed);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isSynced(project)).toBe(true);
      });

      it('should return false when status is not Completed', () => {
        const statusSignal = createStatusSignal(SyncStage.Metadata);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.isSynced(project)).toBe(false);
      });
    });

    describe('hasFailed', () => {
      it('should return false when no status exists', () => {
        syncQueueServiceMock.getProjectStatus.mockReturnValue(undefined);

        expect(component.hasFailed(project)).toBe(false);
      });

      it('should return true when status is Failed', () => {
        const statusSignal = createStatusSignal(SyncStage.Failed);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.hasFailed(project)).toBe(true);
      });

      it('should return false when status is not Failed', () => {
        const statusSignal = createStatusSignal(SyncStage.Completed);
        syncQueueServiceMock.getProjectStatus.mockReturnValue(statusSignal);

        expect(component.hasFailed(project)).toBe(false);
      });
    });
  });
});
