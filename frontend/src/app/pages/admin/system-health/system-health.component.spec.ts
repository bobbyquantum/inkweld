import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SetupService } from '@services/core/setup.service';
import { vi } from 'vitest';

import { AdminSystemHealthComponent } from './system-health.component';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

const mockStats = {
  userCount: 42,
  projectCount: 100,
  pendingUserCount: 3,
  version: '0.1.0',
  uptime: 90061,
  runtime: 'bun',
};

function createComponent() {
  const mockSetupService = {
    getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
  };

  TestBed.configureTestingModule({
    imports: [
      AdminSystemHealthComponent,
      MatCardModule,
      MatIconModule,
      MatProgressSpinnerModule,
      MatButtonModule,
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SetupService, useValue: mockSetupService },
    ],
  });

  const fixture = TestBed.createComponent(AdminSystemHealthComponent);
  const component = fixture.componentInstance;
  const httpMock = TestBed.inject(HttpTestingController);

  return { component, httpMock, mockSetupService, fixture };
}

describe('AdminSystemHealthComponent', () => {
  it('should create the component', () => {
    const { component, httpMock } = createComponent();
    expect(component).toBeTruthy();
    // Drain the auto-triggered ngOnInit request
    httpMock.match('http://localhost:8333/api/v1/admin/stats');
  });

  it('should load stats on init', async () => {
    const { component, httpMock } = createComponent();
    await flushPromises();

    const req = httpMock.expectOne('http://localhost:8333/api/v1/admin/stats');
    expect(req.request.method).toBe('GET');
    req.flush(mockStats);
    await flushPromises();

    expect(component.stats()).toEqual(mockStats);
    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('should set error on load failure', async () => {
    const { component, httpMock } = createComponent();
    await flushPromises();

    const req = httpMock.expectOne('http://localhost:8333/api/v1/admin/stats');
    req.flush('Server error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    await flushPromises();

    expect(component.stats()).toBeNull();
    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Failed to load system statistics');
  });

  it('should refresh stats when loadStats is called', async () => {
    const { component, httpMock } = createComponent();
    await flushPromises();
    // Flush the auto-triggered ngOnInit request
    const initReq = httpMock.expectOne(
      'http://localhost:8333/api/v1/admin/stats'
    );
    initReq.flush(mockStats);
    await flushPromises();

    const loadPromise = component.loadStats();
    await flushPromises();
    const req = httpMock.expectOne('http://localhost:8333/api/v1/admin/stats');
    req.flush({ ...mockStats, userCount: 99 });
    await loadPromise;

    expect(component.stats()!.userCount).toBe(99);
  });

  it('should use empty string when serverUrl is null', async () => {
    const { component, httpMock, mockSetupService } = createComponent();
    await flushPromises();
    // Flush the auto-triggered ngOnInit request
    const initReq = httpMock.expectOne(
      'http://localhost:8333/api/v1/admin/stats'
    );
    initReq.flush(mockStats);
    await flushPromises();

    mockSetupService.getServerUrl.mockReturnValue(null);

    const loadPromise = component.loadStats();
    await flushPromises();
    const req = httpMock.expectOne('/api/v1/admin/stats');
    req.flush(mockStats);
    await loadPromise;

    expect(component.stats()).toEqual(mockStats);
  });

  it('should format days, hours, and minutes', () => {
    const { component, httpMock } = createComponent();
    httpMock.match('http://localhost:8333/api/v1/admin/stats');
    // 1 day, 1 hour, 1 minute = 86400 + 3600 + 60 = 90060
    expect(component.formatUptime(90060)).toBe('1d 1h 1m');
  });

  it('should format hours and minutes without days', () => {
    const { component, httpMock } = createComponent();
    httpMock.match('http://localhost:8333/api/v1/admin/stats');
    expect(component.formatUptime(9000)).toBe('2h 30m');
  });

  it('should format minutes only', () => {
    const { component, httpMock } = createComponent();
    httpMock.match('http://localhost:8333/api/v1/admin/stats');
    expect(component.formatUptime(300)).toBe('5m');
  });

  it('should show 0m for zero uptime', () => {
    const { component, httpMock } = createComponent();
    httpMock.match('http://localhost:8333/api/v1/admin/stats');
    expect(component.formatUptime(0)).toBe('0m');
  });

  it('should handle large uptimes', () => {
    const { component, httpMock } = createComponent();
    httpMock.match('http://localhost:8333/api/v1/admin/stats');
    // 30 days, 5 hours, 45 minutes
    expect(component.formatUptime(30 * 86400 + 5 * 3600 + 45 * 60)).toBe(
      '30d 5h 45m'
    );
  });
});
