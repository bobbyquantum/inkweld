import { provideLocationMocks } from '@angular/common/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import {
  AuthorizationInfo,
  ConsentRequestGrantsInnerRole,
  OAuthService as OAuthApiService,
} from '@inkweld/index';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { OAuthConsentComponent } from './oauth-consent.component';

describe('OAuthConsentComponent', () => {
  let component: OAuthConsentComponent;
  let fixture: ComponentFixture<OAuthConsentComponent>;
  let oauthService: MockedObject<OAuthApiService>;
  let snackBar: MockedObject<MatSnackBar>;
  let router: MockedObject<Router>;
  let queryParams$: BehaviorSubject<Record<string, string>>;

  const mockAuthInfo: AuthorizationInfo = {
    client: {
      id: 'test-client-id',
      clientName: 'Test App',
      clientUri: 'https://test-app.example.com',
      logoUri: 'https://test-app.example.com/logo.png',
    },
    projects: [
      { id: 'proj-1', title: 'Project One', slug: 'project-one' },
      { id: 'proj-2', title: 'Project Two', slug: 'project-two' },
    ],
    scope: 'mcp',
    state: 'test-state',
  };

  const validQueryParams = {
    client_id: 'test-client-id',
    redirect_uri: 'https://test-app.example.com/callback',
    response_type: 'code',
    code_challenge: 'test-challenge',
    code_challenge_method: 'S256',
    scope: 'mcp',
    state: 'test-state',
  };

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<Record<string, string>>({});

    oauthService = {
      getAuthorizationInfo: vi.fn().mockReturnValue(of(mockAuthInfo)),
      submitConsent: vi.fn().mockReturnValue(
        of({
          redirectUri: 'https://test-app.example.com/callback?code=abc123',
        })
      ),
    } as unknown as MockedObject<OAuthApiService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    router = {
      navigate: vi.fn(),
    } as unknown as MockedObject<Router>;

    await TestBed.configureTestingModule({
      imports: [OAuthConsentComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideLocationMocks(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParams: queryParams$.asObservable() },
        },
        { provide: OAuthApiService, useValue: oauthService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(OAuthConsentComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should show error when missing required parameters', async () => {
      queryParams$.next({ client_id: 'test-client-id' }); // Missing other required params
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.error()).toBe('Missing required OAuth parameters');
      expect(component.loading()).toBe(false);
    });

    it('should load authorization info with valid parameters', async () => {
      queryParams$.next(validQueryParams);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(oauthService.getAuthorizationInfo).toHaveBeenCalledWith(
        'test-client-id',
        'https://test-app.example.com/callback',
        'code',
        'test-challenge',
        'S256',
        'mcp',
        'test-state'
      );
    });

    it('should initialize project grants after loading auth info', async () => {
      queryParams$.next(validQueryParams);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.projectGrants().length).toBe(2);
      expect(component.projectGrants()[0].selected).toBe(false);
      expect(component.projectGrants()[0].role).toBe(
        ConsentRequestGrantsInnerRole.Viewer
      );
    });

    it('should display client information', async () => {
      queryParams$.next(validQueryParams);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.clientName()).toBe('Test App');
      expect(component.clientUri()).toBe('https://test-app.example.com');
      expect(component.clientLogo()).toBe(
        'https://test-app.example.com/logo.png'
      );
    });

    it('should handle API error', async () => {
      oauthService.getAuthorizationInfo = vi.fn().mockReturnValue(
        throwError(() => ({
          error: {
            error: 'invalid_client',
            error_description: 'Client not found',
          },
        }))
      );

      fixture = TestBed.createComponent(OAuthConsentComponent);
      component = fixture.componentInstance;
      queryParams$.next(validQueryParams);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.error()).toBe('Client not found');
      expect(component.loading()).toBe(false);
    });
  });

  describe('project selection', () => {
    beforeEach(async () => {
      queryParams$.next(validQueryParams);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should toggle project selection', () => {
      const grant = component.projectGrants()[0];
      expect(grant.selected).toBe(false);

      component.toggleProject(grant);
      expect(component.projectGrants()[0].selected).toBe(true);

      component.toggleProject(component.projectGrants()[0]);
      expect(component.projectGrants()[0].selected).toBe(false);
    });

    it('should update role for a project', () => {
      const grant = component.projectGrants()[0];
      component.updateRole(grant, ConsentRequestGrantsInnerRole.Editor);

      expect(component.projectGrants()[0].role).toBe(
        ConsentRequestGrantsInnerRole.Editor
      );
    });

    it('should select all projects', () => {
      component.selectAll();

      expect(component.projectGrants().every(g => g.selected)).toBe(true);
    });

    it('should deselect all projects', () => {
      component.selectAll();
      component.deselectAll();

      expect(component.projectGrants().every(g => !g.selected)).toBe(true);
    });

    it('should compute hasSelection correctly', () => {
      expect(component.hasSelection()).toBe(false);

      const grant = component.projectGrants()[0];
      component.toggleProject(grant);

      expect(component.hasSelection()).toBe(true);
    });
  });

  describe('consent submission', () => {
    beforeEach(async () => {
      queryParams$.next(validQueryParams);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should show snackbar when no project selected', () => {
      component.approve();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Please select at least one project',
        'Dismiss',
        { duration: 3000 }
      );
    });

    it('should submit consent with selected grants', async () => {
      // Select first project with editor role
      const grant = component.projectGrants()[0];
      component.toggleProject(grant);
      component.updateRole(
        component.projectGrants()[0],
        ConsentRequestGrantsInnerRole.Editor
      );

      // Mock window.location.href using Object.defineProperty
      const hrefSetter = vi.fn();
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        window,
        'location'
      );
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window.location, 'href', {
        set: hrefSetter,
        get: () => '',
        configurable: true,
      });

      component.approve();
      await fixture.whenStable();

      expect(oauthService.submitConsent).toHaveBeenCalledWith(
        'test-client-id',
        'https://test-app.example.com/callback',
        'code',
        'test-challenge',
        'S256',
        'mcp',
        'test-state',
        {
          grants: [
            { projectId: 'proj-1', role: ConsentRequestGrantsInnerRole.Editor },
          ],
        }
      );

      expect(hrefSetter).toHaveBeenCalledWith(
        'https://test-app.example.com/callback?code=abc123'
      );

      // Should show completion state
      expect(component.completed()).toBe(true);
      expect(component.redirectUri()).toBe(
        'https://test-app.example.com/callback?code=abc123'
      );
      expect(component.submitting()).toBe(false);

      // Restore
      if (originalDescriptor) {
        Object.defineProperty(window, 'location', originalDescriptor);
      }
    });

    it('should handle submission error', async () => {
      oauthService.submitConsent = vi.fn().mockReturnValue(
        throwError(() => ({
          error: {
            error: 'server_error',
            error_description: 'Something went wrong',
          },
        }))
      );

      component.selectAll();
      component.approve();
      await fixture.whenStable();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Something went wrong',
        'Dismiss',
        { duration: 5000 }
      );
      expect(component.submitting()).toBe(false);
    });
  });

  describe('deny authorization', () => {
    beforeEach(async () => {
      queryParams$.next(validQueryParams);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should redirect with access_denied error', () => {
      // Mock window.location.href using Object.defineProperty
      let capturedHref = '';
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        window,
        'location'
      );
      const mockLocation = { origin: 'http://localhost' };
      Object.defineProperty(mockLocation, 'href', {
        set: (val: string) => {
          capturedHref = val;
        },
        get: () => capturedHref,
        configurable: true,
      });
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
        configurable: true,
      });

      component.deny();

      expect(capturedHref).toContain('error=access_denied');
      expect(capturedHref).toContain(
        'error_description=User+denied+the+authorization+request'
      );
      expect(capturedHref).toContain('state=test-state');

      // Restore
      if (originalDescriptor) {
        Object.defineProperty(window, 'location', originalDescriptor);
      }
    });

    it('should navigate home when no params', () => {
      // Reset query params to null state
      component['queryParams'].set(null);

      component.deny();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
