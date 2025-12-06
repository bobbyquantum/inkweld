import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BASE_PATH } from '@inkweld/variables';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminSettingsComponent } from './settings.component';

describe('AdminSettingsComponent', () => {
  let component: AdminSettingsComponent;
  let fixture: ComponentFixture<AdminSettingsComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: BASE_PATH, useValue: '' },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminSettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load config on init', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      key: 'USER_APPROVAL_REQUIRED',
      value: 'true',
      source: 'database',
    });
  });

  it('should call setConfig when toggle is changed', async () => {
    fixture.detectChanges();

    // Respond to initial GET request
    const getReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    getReq.flush({
      key: 'USER_APPROVAL_REQUIRED',
      value: 'true',
      source: 'database',
    });

    // Trigger toggle
    const togglePromise = component.toggleUserApproval(false);

    // Respond to PUT request
    const putReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({ value: 'false' });
    putReq.flush(null);

    await togglePromise;
    httpMock.verify();
  });

  it('should update signal value after successful save', async () => {
    fixture.detectChanges();

    // Respond to initial GET request with false
    const getReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    getReq.flush({
      key: 'USER_APPROVAL_REQUIRED',
      value: 'false',
      source: 'database',
    });

    // Trigger toggle to true
    const togglePromise = component.toggleUserApproval(true);

    // Respond to PUT request
    const putReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    putReq.flush(null);

    await togglePromise;

    expect(component.userApprovalRequired()).toBe(true);
    httpMock.verify();
  });
});
