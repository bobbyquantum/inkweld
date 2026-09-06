import { provideHttpClient, withXhr } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
import type { ProfileBackground } from '@inkweld/model/profile-background';
import { ProfileBackgroundPlainKind } from '@inkweld/model/profile-background-plain';
import {
  ProfileBackgroundPresetKind,
  ProfileBackgroundPresetPresetId,
} from '@inkweld/model/profile-background-preset';
import type { UserProfile } from '@inkweld/model/user-profile';
import { SetupService } from '@services/core/setup.service';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UserProfileService } from './user-profile.service';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        {
          provide: SetupService,
          useValue: { getServerUrl: () => 'https://srv' },
        },
        UserProfileService,
      ],
    });
    service = TestBed.inject(UserProfileService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpController.verify());

  it('GETs the profile endpoint with credentials and an encoded username', async () => {
    const mock: UserProfile = {
      username: 'a b',
      name: null,
      bio: null,
      hasAvatar: false,
      isOwner: false,
      appearance: {
        background: { kind: ProfileBackgroundPlainKind.Plain },
        hasBanner: false,
      },
      sections: { activity: true, projects: false },
    };
    const promise = firstValueFrom(service.getProfile('a b'));
    const req = httpController.expectOne(
      'https://srv/api/v1/users/a%20b/profile'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mock);
    expect(await promise).toEqual(mock);
  });

  it('GETs activity with year and an explicit timezone', async () => {
    const mock: ProfileActivityYear = {
      year: 2025,
      timeZone: 'Europe/London',
      days: [],
      totalWords: 0,
      activeDays: 0,
      longestStreak: 0,
      currentStreak: 0,
      availableYears: [2025],
    };
    const promise = firstValueFrom(
      service.getActivity('alice', 2025, 'Europe/London')
    );
    const req = httpController.expectOne(
      r => r.url === 'https://srv/api/v1/users/alice/activity'
    );
    expect(req.request.params.get('year')).toBe('2025');
    expect(req.request.params.get('tz')).toBe('Europe/London');
    req.flush(mock);
    expect(await promise).toEqual(mock);
  });

  it('omits the year when not given and defaults tz to the browser zone', () => {
    const promise = firstValueFrom(service.getActivity('alice'));
    const req = httpController.expectOne(
      r => r.url === 'https://srv/api/v1/users/alice/activity'
    );
    expect(req.request.params.has('year')).toBe(false);
    expect(req.request.params.get('tz')).toBe(
      UserProfileService.browserTimeZone() ?? null
    );
    req.flush({});
    return promise;
  });

  it('builds banner URLs with an optional cache-buster', () => {
    expect(service.bannerUrl('a b')).toBe(
      'https://srv/api/v1/users/a%20b/banner'
    );
    expect(service.bannerUrl('alice', 3)).toBe(
      'https://srv/api/v1/users/alice/banner?v=3'
    );
  });

  it('GETs the banner as a blob with credentials', async () => {
    const promise = firstValueFrom(service.getBanner('alice', 2));
    const req = httpController.expectOne(
      'https://srv/api/v1/users/alice/banner?v=2'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.withCredentials).toBe(true);
    req.flush(new Blob(['img']));
    expect(await promise).toBeInstanceOf(Blob);
  });

  it('PUTs the profile background with credentials', async () => {
    const background: ProfileBackground = {
      kind: ProfileBackgroundPresetKind.Preset,
      presetId: ProfileBackgroundPresetPresetId.Dusk,
    };
    const promise = firstValueFrom(service.setProfileBackground(background));
    const req = httpController.expectOne(
      'https://srv/api/v1/users/me/profile-background'
    );
    expect(req.request.method).toBe('PUT');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual(background);
    req.flush(background);
    expect(await promise).toEqual(background);
  });

  it('POSTs the banner as multipart form data', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const promise = firstValueFrom(service.uploadBanner(blob, 'hero.jpg'));
    const req = httpController.expectOne('https://srv/api/v1/users/me/banner');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('banner') as File).name).toBe('hero.jpg');
    req.flush({ message: 'ok' });
    await promise;
  });

  it('DELETEs the banner', async () => {
    const promise = firstValueFrom(service.deleteBanner());
    const req = httpController.expectOne('https://srv/api/v1/users/me/banner');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ message: 'ok' });
    await promise;
  });

  it('reports a browser timezone', () => {
    const tz = UserProfileService.browserTimeZone();
    expect(typeof tz === 'string' || tz === undefined).toBe(true);
  });
});
