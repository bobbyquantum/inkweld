import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SetupService } from '../core/setup.service';
import { AdminAppearanceService } from './admin-appearance.service';

const SERVER = 'https://inkweld.example.com';

describe('AdminAppearanceService', () => {
  let service: AdminAppearanceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminAppearanceService,
        {
          provide: SetupService,
          useValue: { getServerUrl: () => SERVER },
        },
      ],
    });

    service = TestBed.inject(AdminAppearanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('uploads the file as multipart form data under the surface path', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const upload = service.uploadBackground('login', file, 'bg.png');

    const request = http.expectOne({
      method: 'PUT',
      url: `${SERVER}/api/v1/admin/appearance/background/login`,
    });
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('background')).toBeTruthy();
    expect(request.request.withCredentials).toBe(true);
    request.flush({ message: 'ok' });

    await upload;
  });

  it('deletes the image for a surface', async () => {
    const remove = service.deleteBackground('home');

    const request = http.expectOne({
      method: 'DELETE',
      url: `${SERVER}/api/v1/admin/appearance/background/home`,
    });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ message: 'ok' });

    await remove;
  });

  it('falls back to a relative path when no server URL is configured', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminAppearanceService,
        { provide: SetupService, useValue: { getServerUrl: () => null } },
      ],
    });
    service = TestBed.inject(AdminAppearanceService);
    http = TestBed.inject(HttpTestingController);

    const remove = service.deleteBackground('login');
    const request = http.expectOne({
      method: 'DELETE',
      url: '/api/v1/admin/appearance/background/login',
    });
    expect(request.request.url).toBe(
      '/api/v1/admin/appearance/background/login'
    );
    request.flush({ message: 'ok' });
    await remove;
  });
});
