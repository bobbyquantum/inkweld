import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MigrationService } from '@services/migration.service';
import { SetupService } from '@services/setup.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { ConnectionSettingsComponent } from './connection-settings.component';

describe('ConnectionSettingsComponent', () => {
  let component: ConnectionSettingsComponent;
  let fixture: ComponentFixture<ConnectionSettingsComponent>;
  let setupService: MockedObject<SetupService>;
  let migrationService: MockedObject<MigrationService>;
  let dialog: MockedObject<MatDialog>;
  let router: MockedObject<Router>;

  beforeEach(async () => {
    setupService = {
      getMode: vi.fn().mockReturnValue('offline'),
      getServerUrl: vi.fn().mockReturnValue(null),
      resetConfiguration: vi.fn(),
      configureServerMode: vi.fn(),
    } as unknown as MockedObject<SetupService>;

    migrationService = {
      hasOfflineProjects: vi.fn().mockReturnValue(false),
      getOfflineProjectsCount: vi.fn().mockReturnValue(0),
      migrationState: vi.fn(() => ({
        status: 'NotStarted',
        totalProjects: 0,
        completedProjects: 0,
        failedProjects: 0,
        projectStatuses: [],
      })),
    } as unknown as MockedObject<MigrationService>;

    dialog = {
      open: vi.fn(),
    } as unknown as MockedObject<MatDialog>;

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    await TestBed.configureTestingModule({
      imports: [ConnectionSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: SetupService, useValue: setupService },
        { provide: MigrationService, useValue: migrationService },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectionSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display offline mode', () => {
    expect(component['currentMode']).toBe('offline');
  });

  describe('safety guards', () => {
    it('should show confirmation dialog when switching from server to offline mode', async () => {
      // Setup: component in server mode
      component['currentMode'] = 'server';

      // Mock dialog to return confirmed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      await component.switchToOfflineMode();

      // Wait for all promises to resolve
      await fixture.whenStable();

      expect(dialog.open).toHaveBeenCalled();
      expect(setupService.resetConfiguration).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/setup']);
    });

    it('should not switch modes if user cancels confirmation', async () => {
      // Setup: component in server mode
      component['currentMode'] = 'server';

      // Mock dialog to return cancelled
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(false),
      } as any);

      await component.switchToOfflineMode();

      expect(dialog.open).toHaveBeenCalled();
      expect(setupService.resetConfiguration).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should show confirmation when migrating offline projects', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      migrationService.hasOfflineProjects.mockReturnValue(true);
      migrationService.getOfflineProjectsCount.mockReturnValue(2);

      // Mock dialog to return confirmed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      await component.startMigration();

      expect(dialog.open).toHaveBeenCalled();
      // Should show auth form after confirmation
      expect(component['showAuthForm']()).toBe(true);
    });

    it('should not start migration if user cancels', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      migrationService.hasOfflineProjects.mockReturnValue(true);
      migrationService.getOfflineProjectsCount.mockReturnValue(2);

      // Mock dialog to return cancelled
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(false),
      } as any);

      await component.startMigration();

      expect(dialog.open).toHaveBeenCalled();
      // Should NOT show auth form if cancelled
      expect(component['showAuthForm']()).toBe(false);
    });

    it('should show confirmation when changing servers in server mode', async () => {
      component['currentMode'] = 'server';
      component['newServerUrl'] = 'http://different-server:8333';
      migrationService.hasOfflineProjects.mockReturnValue(false);

      // Mock dialog to return confirmed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      await component.startMigration();

      expect(dialog.open).toHaveBeenCalled();
      expect(setupService.configureServerMode).toHaveBeenCalled();
    });
  });

  it('should switch to offline mode without confirmation in offline mode', async () => {
    // Already in offline mode - no confirmation needed
    component['currentMode'] = 'offline';

    await component.switchToOfflineMode();

    // Wait for all promises to resolve
    await fixture.whenStable();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(setupService.resetConfiguration).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/setup']);
  });
});
