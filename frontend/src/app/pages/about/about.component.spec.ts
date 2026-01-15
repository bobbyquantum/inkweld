import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { User } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { AboutComponent } from './about.component';

describe('AboutComponent', () => {
  let component: AboutComponent;
  let fixture: ComponentFixture<AboutComponent>;
  let routerMock: MockedObject<Router>;
  let userServiceMock: MockedObject<UnifiedUserService>;
  let setupServiceMock: MockedObject<SetupService>;
  let themeServiceMock: MockedObject<ThemeService>;
  let dialogGatewayMock: MockedObject<DialogGatewayService>;
  let localStorageMock: MockedObject<LocalStorageService>;
  let legacyUserServiceMock: MockedObject<UserService>;

  const mockUser: User = {
    id: '1',
    username: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    enabled: true,
  };

  beforeEach(async () => {
    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    userServiceMock = {
      currentUser: signal(mockUser),
      getMode: vi.fn().mockReturnValue('local'),
    } as unknown as MockedObject<UnifiedUserService>;

    setupServiceMock = {
      getMode: vi.fn().mockReturnValue('server'),
    } as unknown as MockedObject<SetupService>;

    themeServiceMock = {
      update: vi.fn(),
      getCurrentTheme: vi
        .fn()
        .mockReturnValue(of('light-theme' as ThemeOption)),
    } as unknown as MockedObject<ThemeService>;

    dialogGatewayMock = {
      openUserSettingsDialog: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<DialogGatewayService>;

    localStorageMock = {
      getUserAvatarUrl: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<LocalStorageService>;

    legacyUserServiceMock = {} as unknown as MockedObject<UserService>;

    await TestBed.configureTestingModule({
      imports: [AboutComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: Router, useValue: routerMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: UserService, useValue: legacyUserServiceMock },
        { provide: ActivatedRoute, useValue: { params: of({}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display app name', () => {
    expect(component.appName).toBe('Inkweld');
  });

  it('should display app version', () => {
    expect(component.appVersion).toBeDefined();
    expect(typeof component.appVersion).toBe('string');
  });

  it('should display app description', () => {
    expect(component.appDescription).toBeDefined();
    expect(typeof component.appDescription).toBe('string');
  });

  it('should have key libraries defined', () => {
    expect(component.keyLibraries).toBeDefined();
    expect(component.keyLibraries.length).toBeGreaterThan(0);
  });

  it('should include Angular in key libraries', () => {
    const angular = component.keyLibraries.find(lib => lib.name === 'Angular');
    expect(angular).toBeDefined();
    expect(angular?.url).toBe('https://angular.dev');
  });

  it('should include Yjs in key libraries', () => {
    const yjs = component.keyLibraries.find(lib => lib.name === 'Yjs');
    expect(yjs).toBeDefined();
    expect(yjs?.url).toBe('https://yjs.dev');
  });

  it('should navigate back when goBack is called', () => {
    component.goBack();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should open licenses in new tab when openLicenses is called', () => {
    const windowOpenSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null);
    component.openLicenses();
    expect(windowOpenSpy).toHaveBeenCalledWith(
      '/3rdpartylicenses.txt',
      '_blank'
    );
    windowOpenSpy.mockRestore();
  });

  it('should open external link in new tab', () => {
    const windowOpenSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null);
    const testUrl = 'https://angular.dev';
    component.openExternalLink(testUrl);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      testUrl,
      '_blank',
      'noopener,noreferrer'
    );
    windowOpenSpy.mockRestore();
  });

  it('should have the current year set', () => {
    const currentYear = new Date().getFullYear();
    expect(component.currentYear).toBe(currentYear);
  });

  it('should render version card in template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const versionCard = compiled.querySelector('[data-testid="version-card"]');
    expect(versionCard).toBeTruthy();
  });

  it('should render libraries card in template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const librariesCard = compiled.querySelector(
      '[data-testid="libraries-card"]'
    );
    expect(librariesCard).toBeTruthy();
  });

  it('should render licenses card in template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const licensesCard = compiled.querySelector(
      '[data-testid="licenses-card"]'
    );
    expect(licensesCard).toBeTruthy();
  });

  it('should render back button in template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const backButton = compiled.querySelector(
      '[data-testid="about-back-button"]'
    );
    expect(backButton).toBeTruthy();
  });
});
