import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { SystemConfigService } from '@services/core/system-config.service';
import { vi } from 'vitest';

import { ApprovalPendingComponent } from './approval-pending.component';

describe('ApprovalPendingComponent', () => {
  let component: ApprovalPendingComponent;
  let fixture: ComponentFixture<ApprovalPendingComponent>;
  let mockSystemConfigService: {
    systemFeatures: () => { defaultServerName?: string };
  };
  let mockActivatedRoute: any;

  beforeEach(async () => {
    mockSystemConfigService = {
      systemFeatures: vi.fn(() => ({ defaultServerName: 'Test Server' })),
    };

    // Create a custom queryParams object that mimics ParamMap behavior but is mutable
    const createQueryParams = (params: Record<string, string>) => ({
      get: (key: string) => params[key] ?? null,
      getAll: (key: string) => (params[key] ? [params[key]] : []),
      has: (key: string) => key in params,
      keys: Object.keys(params),
      ...params,
    });

    mockActivatedRoute = {
      snapshot: {
        queryParams: createQueryParams({}),
      },
    };

    await TestBed.configureTestingModule({
      imports: [ApprovalPendingComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: mockActivatedRoute,
        },
        {
          provide: SystemConfigService,
          useValue: mockSystemConfigService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ApprovalPendingComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should extract query parameters from route on init', () => {
    mockActivatedRoute.snapshot.queryParams = {
      username: 'testuser',
      name: 'Test User',
      userId: '123',
      get: vi.fn((key: string) => {
        const params: Record<string, string> = {
          username: 'testuser',
          name: 'Test User',
          userId: '123',
        };
        return params[key] ?? null;
      }),
    };

    component.ngOnInit();

    expect(component.username).toBe('testuser');
    expect(component.name).toBe('Test User');
    expect(component.userId).toBe('123');
  });

  it('should handle missing query parameters gracefully', () => {
    fixture.detectChanges();

    expect(component.username).toBe('');
    expect(component.name).toBe('');
    expect(component.userId).toBe('');
  });

  it('should handle partial query parameters', () => {
    mockActivatedRoute.snapshot.queryParams = {
      username: 'john',
      get: vi.fn((key: string) => {
        const params: Record<string, string> = { username: 'john' };
        return params[key] ?? null;
      }),
    };

    component.ngOnInit();

    expect(component.username).toBe('john');
    expect(component.name).toBe('');
    expect(component.userId).toBe('');
  });

  it('should return server name from system config', () => {
    fixture.detectChanges();

    expect(component.serverName).toBe('Test Server');
  });

  it('should return default server name when not configured', () => {
    mockSystemConfigService.systemFeatures = vi.fn(() => ({
      defaultServerName: undefined,
    }));

    fixture.detectChanges();

    expect(component.serverName).toBe('Inkweld');
  });

  describe('displayName getter', () => {
    it('should return trimmed name when name is provided and not empty', () => {
      mockActivatedRoute.snapshot.queryParams = {
        name: '  Jane Doe  ',
        username: 'janedoe',
        get: vi.fn((key: string) => {
          const params: Record<string, string> = {
            name: '  Jane Doe  ',
            username: 'janedoe',
          };
          return params[key] ?? null;
        }),
      };

      component.ngOnInit();

      expect(component.displayName).toBe('Jane Doe');
    });

    it('should return trimmed username when name is empty but username exists', () => {
      mockActivatedRoute.snapshot.queryParams = {
        name: '   ',
        username: '  johndoe  ',
        get: vi.fn((key: string) => {
          const params: Record<string, string> = {
            name: '   ',
            username: '  johndoe  ',
          };
          return params[key] ?? null;
        }),
      };

      component.ngOnInit();

      expect(component.displayName).toBe('johndoe');
    });

    it('should return "User" when both name and username are empty or whitespace', () => {
      mockActivatedRoute.snapshot.queryParams = {
        name: '   ',
        username: '   ',
        get: vi.fn((key: string) => {
          const params: Record<string, string> = {
            name: '   ',
            username: '   ',
          };
          return params[key] ?? null;
        }),
      };

      component.ngOnInit();

      expect(component.displayName).toBe('User');
    });

    it('should return "User" when no name or username are provided', () => {
      fixture.detectChanges();

      expect(component.displayName).toBe('User');
    });

    it('should prioritize name over username when both are provided', () => {
      mockActivatedRoute.snapshot.queryParams = {
        name: 'Full Name',
        username: 'username',
        get: vi.fn((key: string) => {
          const params: Record<string, string> = {
            name: 'Full Name',
            username: 'username',
          };
          return params[key] ?? null;
        }),
      };

      component.ngOnInit();

      expect(component.displayName).toBe('Full Name');
    });
  });

  it('should render the component template correctly', () => {
    mockActivatedRoute.snapshot.queryParams = {
      username: 'testuser',
      name: 'Test User',
      get: vi.fn((key: string) => {
        const params: Record<string, string> = {
          username: 'testuser',
          name: 'Test User',
        };
        return params[key] ?? null;
      }),
    };

    component.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Check for main card
    expect(compiled.querySelector('mat-card')).toBeTruthy();

    // Check for title
    expect(compiled.querySelector('mat-card-title')?.textContent).toContain(
      'Registration Successful!'
    );

    // Check for subtitle
    expect(compiled.querySelector('mat-card-subtitle')?.textContent).toContain(
      'Awaiting Administrator Approval'
    );

    // Check that display name is shown in the welcome message
    const welcomeMessage = compiled.querySelector('.success-message');
    expect(welcomeMessage?.textContent).toContain('Test User');
  });
});
