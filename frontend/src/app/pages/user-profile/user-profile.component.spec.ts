import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
import { ProfileBackgroundPlainKind } from '@inkweld/model/profile-background-plain';
import {
  ProfileBackgroundPresetKind,
  ProfileBackgroundPresetPresetId,
} from '@inkweld/model/profile-background-preset';
import { ProfileVisibility } from '@inkweld/model/profile-visibility';
import type { UserProfile } from '@inkweld/model/user-profile';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserProfileService } from '@services/user/user-profile.service';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { UserProfileComponent } from './user-profile.component';

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  username: 'alice',
  name: 'Alice',
  bio: 'Writes things.',
  hasAvatar: false,
  isOwner: false,
  appearance: {
    background: { kind: ProfileBackgroundPlainKind.Plain },
    hasBanner: false,
  },
  sections: { activity: true, projects: true },
  projects: [
    { slug: 'novel', title: 'Novel', description: 'A book', updatedDate: 1 },
  ],
  ...overrides,
});

const makeActivity = (
  overrides: Partial<ProfileActivityYear> = {}
): ProfileActivityYear => ({
  year: 2026,
  timeZone: 'UTC',
  days: [{ day: '2026-01-01', words: 10, sessions: 1 }],
  totalWords: 10,
  activeDays: 1,
  longestStreak: 1,
  currentStreak: 0,
  availableYears: [2026, 2025],
  ...overrides,
});

describe('UserProfileComponent', () => {
  let fixture: ComponentFixture<UserProfileComponent>;
  let component: UserProfileComponent;
  let profileService: ReturnType<typeof mockDeep<UserProfileService>>;
  let dialogGateway: ReturnType<typeof mockDeep<DialogGatewayService>>;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let mode: 'server' | 'local';
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let currentUser: ReturnType<typeof signal<Record<string, unknown>>>;
  let localProjects: ReturnType<typeof signal<Record<string, unknown>[]>>;
  let loadProjects: ReturnType<typeof vi.fn>;

  const setup = async (username = 'alice', mobile = false) => {
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), UserProfileComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of({ get: () => username }) },
        },
        { provide: UserProfileService, useValue: profileService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: Router, useValue: router },
        { provide: LoggerService, useValue: mockDeep<LoggerService>() },
        { provide: SetupService, useValue: { getMode: () => mode } },
        {
          provide: UnifiedUserService,
          useValue: { isAuthenticated, currentUser },
        },
        {
          provide: UnifiedProjectService,
          useValue: { loadProjects, projects: localProjects },
        },
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: mobile, breakpoints: {} }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // paramMap is debounced by 10ms.
    await new Promise(r => setTimeout(r, 30));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    profileService = mockDeep<UserProfileService>();
    dialogGateway = mockDeep<DialogGatewayService>();
    router = { navigate: vi.fn().mockResolvedValue(true) };
    mode = 'server';
    isAuthenticated = signal(true);
    currentUser = signal({
      username: 'alice',
      name: 'Alice',
      hasAvatar: false,
    });
    localProjects = signal([]);
    loadProjects = vi.fn().mockResolvedValue(undefined);
    profileService.getProfile.mockReturnValue(of(makeProfile()));
    profileService.getActivity.mockReturnValue(of(makeActivity()));
  });

  it('loads the profile for the route username and renders it', async () => {
    await setup();
    expect(profileService.getProfile).toHaveBeenCalledWith('alice');
    expect(component.loadState()).toBe('ready');
    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-testid="profile-name"]')?.textContent
    ).toContain('Alice');
    expect(
      el.querySelector('[data-testid="profile-bio"]')?.textContent
    ).toContain('Writes things.');
    expect(el.querySelector('[data-testid="profile-activity"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="profile-projects"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="profile-edit-button"]')).toBeNull();
  });

  it('loads activity only when the section is visible', async () => {
    await setup();
    expect(profileService.getActivity).toHaveBeenCalledWith('alice', undefined);
    expect(component.activity()?.year).toBe(2026);

    profileService.getActivity.mockClear();
    profileService.getProfile.mockReturnValue(
      of(makeProfile({ sections: { activity: false, projects: true } }))
    );
    TestBed.resetTestingModule();
    await setup();
    expect(profileService.getActivity).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[data-testid="profile-activity"]')
    ).toBeNull();
  });

  it('hides the projects section when not visible', async () => {
    profileService.getProfile.mockReturnValue(
      of(
        makeProfile({
          sections: { activity: true, projects: false },
          projects: undefined,
        })
      )
    );
    await setup();
    expect(
      fixture.nativeElement.querySelector('[data-testid="profile-projects"]')
    ).toBeNull();
  });

  it('shows owner affordances and reloads after editing', async () => {
    profileService.getProfile.mockReturnValue(
      of(
        makeProfile({
          isOwner: true,
          visibility: {
            profile: ProfileVisibility.Members,
            activity: ProfileVisibility.Public,
            projects: ProfileVisibility.Private,
          },
        })
      )
    );
    dialogGateway.openUserSettingsDialog.mockResolvedValue(undefined);
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-testid="profile-visibility-badge"]')?.textContent
    ).toContain('Visible to members');
    el.querySelector<HTMLButtonElement>(
      '[data-testid="profile-edit-button"]'
    )!.click();
    await fixture.whenStable();
    expect(dialogGateway.openUserSettingsDialog).toHaveBeenCalledWith(
      'account'
    );
    expect(profileService.getProfile).toHaveBeenCalledTimes(2);
  });

  it('renders the private state on 403, with a sign-in hint for anonymous visitors', async () => {
    isAuthenticated.set(false);
    profileService.getProfile.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 }))
    );
    await setup();
    expect(component.loadState()).toBe('private');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="profile-private"]')).not.toBeNull();
    expect(el.querySelector('.hint')).not.toBeNull();
    expect(profileService.getActivity).not.toHaveBeenCalled();
  });

  it('renders not-found on 404 and error on anything else', async () => {
    profileService.getProfile.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 }))
    );
    await setup();
    expect(component.loadState()).toBe('not-found');
    expect(
      fixture.nativeElement.querySelector('[data-testid="profile-not-found"]')
    ).not.toBeNull();

    TestBed.resetTestingModule();
    profileService.getProfile.mockReturnValue(
      throwError(() => new Error('boom'))
    );
    await setup();
    expect(component.loadState()).toBe('error');
    expect(component.loadError()).toBe(true);
  });

  it('marks activity as errored without failing the page', async () => {
    profileService.getActivity.mockReturnValue(
      throwError(() => new Error('x'))
    );
    await setup();
    expect(component.loadState()).toBe('ready');
    expect(component.activityError()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('.section-error')
    ).not.toBeNull();
  });

  it('reloads activity for a different year', async () => {
    await setup();
    profileService.getActivity.mockReturnValue(
      of(makeActivity({ year: 2025 }))
    );
    component.onYearChange(2025);
    await fixture.whenStable();
    expect(profileService.getActivity).toHaveBeenLastCalledWith('alice', 2025);
    expect(component.activity()?.year).toBe(2025);
  });

  it('ignores a stale activity response after the year changes', async () => {
    await setup();
    const slow = new Subject<ProfileActivityYear>();
    profileService.getActivity.mockReturnValueOnce(slow.asObservable());
    component.onYearChange(2024);
    profileService.getActivity.mockReturnValueOnce(
      of(makeActivity({ year: 2025 }))
    );
    component.onYearChange(2025);
    await fixture.whenStable();
    expect(component.activity()?.year).toBe(2025);

    // The 2024 request completes late and must not win.
    slow.next(makeActivity({ year: 2024 }));
    slow.complete();
    await fixture.whenStable();
    expect(component.activity()?.year).toBe(2025);
    expect(component.activityLoading()).toBe(false);
  });

  it('ignores a stale profile response after the username changes', async () => {
    const slow = new Subject<UserProfile>();
    profileService.getProfile.mockReturnValueOnce(slow.asObservable());
    await setup('alice');
    expect(component.loadState()).toBe('loading');

    profileService.getProfile.mockReturnValueOnce(
      of(makeProfile({ username: 'bob', name: 'Bob' }))
    );
    await component.loadProfile('bob');
    expect(component.profile()?.username).toBe('bob');

    slow.next(makeProfile({ username: 'alice' }));
    slow.complete();
    await fixture.whenStable();
    expect(component.profile()?.username).toBe('bob');
  });

  it('falls back to the local user in local mode', async () => {
    mode = 'local';
    localProjects.set([{ slug: 'p', title: 'Local Book', description: null }]);
    await setup('alice');
    expect(profileService.getProfile).not.toHaveBeenCalled();
    expect(loadProjects).toHaveBeenCalled();
    expect(component.loadState()).toBe('ready');
    expect(component.isOwner()).toBe(true);
    expect(component.projects().map(p => p.title)).toEqual(['Local Book']);
    expect(component.profile()?.sections.activity).toBe(false);
  });

  it('is not-found for anyone but the local user in local mode', async () => {
    mode = 'local';
    await setup('someone-else');
    expect(component.loadState()).toBe('not-found');
  });

  it('tracks the mobile breakpoint and navigates home', async () => {
    await setup('alice', true);
    expect(component.isMobile()).toBe(true);
    component.navigateHome();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('paints a plain backdrop by default, with no banner', async () => {
    await setup();
    const page: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="profile-page"]'
    );
    expect(page.classList.contains('plain-backdrop')).toBe(true);
    expect(page.style.getPropertyValue('--app-bg-image')).toBe('none');
    expect(component.backdrop()).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="profile-banner"]')
    ).toBeNull();
  });

  it("paints the owner's preset backdrop and banner for every visitor", async () => {
    profileService.getBanner.mockReturnValue(of(new Blob(['img'])));
    profileService.getProfile.mockReturnValue(
      of(
        makeProfile({
          appearance: {
            background: {
              kind: ProfileBackgroundPresetKind.Preset,
              presetId: ProfileBackgroundPresetPresetId.Dusk,
            },
            hasBanner: true,
          },
        })
      )
    );
    await setup();
    const page: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="profile-page"]'
    );
    expect(page.classList.contains('plain-backdrop')).toBe(false);
    expect(page.style.getPropertyValue('--app-bg-image')).toContain(
      'linear-gradient'
    );
    expect(page.style.getPropertyValue('--app-bg-color')).toBe('#2b1b3d');
    expect(
      fixture.nativeElement.querySelector('[data-testid="profile-banner"]')
    ).not.toBeNull();
    expect(profileService.getBanner).toHaveBeenCalledWith('alice', 0);
  });

  it('falls back to plain for a preset the client does not know', async () => {
    profileService.getProfile.mockReturnValue(
      of(
        makeProfile({
          appearance: {
            background: {
              kind: ProfileBackgroundPresetKind.Preset,
              presetId: 'retired' as ProfileBackgroundPresetPresetId,
            },
            hasBanner: false,
          },
        })
      )
    );
    await setup();
    expect(component.backdrop()).toBeNull();
  });

  it('lets the owner customise the page and reloads when something changed', async () => {
    profileService.getProfile.mockReturnValue(
      of(makeProfile({ isOwner: true }))
    );
    dialogGateway.openProfileAppearanceDialog.mockResolvedValue(true);
    await setup();
    profileService.getProfile.mockClear();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="profile-customise-button"]'
    );
    expect(button).not.toBeNull();
    button.click();
    await fixture.whenStable();

    expect(dialogGateway.openProfileAppearanceDialog).toHaveBeenCalledWith({
      username: 'alice',
      appearance: {
        background: { kind: ProfileBackgroundPlainKind.Plain },
        hasBanner: false,
      },
    });
    expect(component.bannerVersion()).toBe(1);
    expect(profileService.getProfile).toHaveBeenCalledWith('alice');
  });

  it('does not reload when the customise dialog changed nothing', async () => {
    profileService.getProfile.mockReturnValue(
      of(makeProfile({ isOwner: true }))
    );
    dialogGateway.openProfileAppearanceDialog.mockResolvedValue(false);
    await setup();
    profileService.getProfile.mockClear();

    component.openCustomiseDialog();
    await fixture.whenStable();
    expect(component.bannerVersion()).toBe(0);
    expect(profileService.getProfile).not.toHaveBeenCalled();
  });

  it('hides the customise button in local mode and for visitors', async () => {
    await setup();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="profile-customise-button"]'
      )
    ).toBeNull();

    mode = 'local';
    TestBed.resetTestingModule();
    await setup();
    expect(component.isOwner()).toBe(true);
    expect(component.backdrop()).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="profile-customise-button"]'
      )
    ).toBeNull();
  });

  it('opens the avatar dialog', async () => {
    dialogGateway.openEditAvatarDialog.mockResolvedValue(false);
    await setup();
    component.openEditAvatarDialog();
    expect(dialogGateway.openEditAvatarDialog).toHaveBeenCalled();
  });
});
