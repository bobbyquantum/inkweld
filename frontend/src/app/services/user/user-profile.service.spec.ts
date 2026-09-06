import { provideHttpClient, withXhr } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
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

  it('reports a browser timezone', () => {
    const tz = UserProfileService.browserTimeZone();
    expect(typeof tz === 'string' || tz === undefined).toBe(true);
  });
});
