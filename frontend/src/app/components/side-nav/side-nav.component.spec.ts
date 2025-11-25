import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
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

      expect(navItems).toHaveLength(2);
      expect(navItems[0]).toEqual({
        label: 'Bookshelf',
        icon: 'collections_bookmark',
        route: '/home',
      });
      expect(navItems[1]).toEqual({
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

      expect(navItems[1].route).toBe('/home');
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

      expect(isOpenSignal()).toBe(false);
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
  });
});
