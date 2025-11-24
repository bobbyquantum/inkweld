import { BreakpointObserver } from '@angular/cdk/layout';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Project, User } from '@inkweld/index';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import { ProjectService } from '@services/project.service';
import { UnifiedProjectService } from '@services/unified-project.service';
import { UnifiedUserService } from '@services/unified-user.service';
import { UserService } from '@services/user.service';
import { of, Subject } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { UserProfileComponent } from './user-profile.component';

describe('UserProfileComponent', () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;
  let subjectCompleteSpy: any;
  let subjectNextSpy: any;
  let userService: MockedObject<UserService>;
  let breakpointObserver: MockedObject<BreakpointObserver>;
  let projectService: Partial<ProjectService>;
  let unifiedUserService: MockedObject<UnifiedUserService>;
  let unifiedProjectService: MockedObject<UnifiedProjectService>;
  let dialogGateway: MockedObject<DialogGatewayService>;
  let router: MockedObject<Router>;

  const activatedRouteMock = {
    paramMap: of({
      get: (param: string) => {
        if (param === 'username') {
          return 'testuser';
        }
        return null;
      },
    }),
  };

  beforeEach(async () => {
    // Spy on Subject's next and complete methods
    const originalSubject = Subject.prototype;
    subjectNextSpy = vi.spyOn(originalSubject, 'next');
    subjectCompleteSpy = vi.spyOn(originalSubject, 'complete');

    // Mock UserService similar to HomeComponent
    userService = {
      currentUser: signal<User>({
        name: 'Test User',
        username: 'testuser',
        id: '1',
        enabled: true,
      }),
    } as unknown as MockedObject<UserService>;

    // Mock UnifiedUserService
    unifiedUserService = {
      currentUser: vi.fn().mockReturnValue({
        name: 'Test User',
        username: 'testuser',
        id: '1',
        enabled: true,
      }),
    } as unknown as MockedObject<UnifiedUserService>;

    // Mock UnifiedProjectService
    unifiedProjectService = {
      loadProjects: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<UnifiedProjectService>;

    // Mock DialogGatewayService
    dialogGateway = {
      openEditAvatarDialog: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<DialogGatewayService>;

    // Mock Router
    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    // Mock BreakpointObserver
    breakpointObserver = {
      observe: vi.fn().mockReturnValue(of({ matches: false, breakpoints: {} })),
    } as unknown as MockedObject<BreakpointObserver>;

    // Mock ProjectService to avoid service injection issues
    projectService = {
      loadAllProjects: vi.fn().mockResolvedValue(undefined),
      projects: signal<Project[]>([]),
    };

    await TestBed.configureTestingModule({
      imports: [UserProfileComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ActivatedRoute, useValue: activatedRouteMock },
        { provide: UserService, useValue: userService },
        { provide: UnifiedUserService, useValue: unifiedUserService },
        { provide: UnifiedProjectService, useValue: unifiedProjectService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: Router, useValue: router },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: ProjectService, useValue: projectService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should extract username from route params', () => {
    expect(component.username).toBe('testuser');
  });

  describe('breakpoint observer', () => {
    it('should set isMobile to true for mobile breakpoints', async () => {
      breakpointObserver.observe.mockReturnValue(
        of({ matches: true, breakpoints: {} })
      );

      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [UserProfileComponent],
        providers: [
          provideZonelessChangeDetection(),
          { provide: ActivatedRoute, useValue: activatedRouteMock },
          { provide: UserService, useValue: userService },
          { provide: UnifiedUserService, useValue: unifiedUserService },
          { provide: UnifiedProjectService, useValue: unifiedProjectService },
          { provide: DialogGatewayService, useValue: dialogGateway },
          { provide: Router, useValue: router },
          { provide: BreakpointObserver, useValue: breakpointObserver },
          { provide: ProjectService, useValue: projectService },
        ],
      }).compileComponents();

      const newFixture = TestBed.createComponent(UserProfileComponent);
      newFixture.detectChanges();

      expect(newFixture.componentInstance.isMobile).toBe(true);
    });
  });

  describe('navigateHome', () => {
    it('should navigate to home page', () => {
      component.navigateHome();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('openEditAvatarDialog', () => {
    it('should open edit avatar dialog', () => {
      component.openEditAvatarDialog();
      expect(dialogGateway.openEditAvatarDialog).toHaveBeenCalled();
    });
  });

  it('should properly clean up subscriptions when destroyed', () => {
    // Act - trigger ngOnDestroy
    component.ngOnDestroy();

    // Assert - verify the destroy subject was called
    expect(subjectNextSpy).toHaveBeenCalled();
    expect(subjectCompleteSpy).toHaveBeenCalled();
  });

  describe('loadUserProjects error handling', () => {
    it('should handle errors when loading projects', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      unifiedProjectService.loadProjects.mockRejectedValue(
        new Error('Load failed')
      );

      // Trigger profile load manually by calling the private method
      await component['loadUserProjects']();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load projects:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });
});
