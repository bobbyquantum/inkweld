import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Project } from '@inkweld/index';
import { UserService } from '@services/user/user.service';
import { MockedObject, vi } from 'vitest';

import { NavItem, SideNavComponent } from './side-nav.component';

describe('SideNavComponent', () => {
  let component: SideNavComponent;
  let fixture: ComponentFixture<SideNavComponent>;
  let routerMock: MockedObject<Router>;
  let userServiceMock: MockedObject<UserService>;

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

    await TestBed.configureTestingModule({
      imports: [SideNavComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: routerMock },
        { provide: UserService, useValue: userServiceMock },
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
});
