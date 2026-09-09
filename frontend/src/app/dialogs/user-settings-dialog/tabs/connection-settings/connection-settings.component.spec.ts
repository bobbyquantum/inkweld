import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import {
  type ProfileInfo,
  ProfileManagerService,
} from '@services/core/profile-manager.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { of } from 'rxjs';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { ConnectionSettingsComponent } from './connection-settings.component';

function info(partial: Partial<ProfileInfo> & { id: string }): ProfileInfo {
  const { id, ...rest } = partial;
  return {
    config: {
      id,
      type: rest.kind ?? 'local',
      addedAt: '',
      lastUsedAt: '',
      userProfile: { name: 'Bobby', username: 'bobby' },
    },
    kind: 'local',
    name: id,
    subtitle: '',
    icon: 'computer',
    isActive: false,
    hasCredentials: true,
    isBuiltIn: false,
    ...rest,
  };
}

describe('ConnectionSettingsComponent', () => {
  let component: ConnectionSettingsComponent;
  let fixture: ComponentFixture<ConnectionSettingsComponent>;
  let connections: ReturnType<typeof signal<ProfileInfo[]>>;
  let manager: {
    connections: ReturnType<typeof signal<ProfileInfo[]>>;
    activeConnection: () => ProfileInfo | null;
    switchTo: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let dialog: {
    open: ReturnType<typeof vi.fn>;
    closeAll: ReturnType<typeof vi.fn>;
  };
  let gateway: { openProfileManagerDialog: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  const originalLocation = window.location;

  const current = info({
    id: 'cloud-dropbox-1',
    kind: 'cloud',
    name: 'Dropbox',
    subtitle: 'Dropbox · bobby@example.com',
    icon: 'cloud_sync',
    isActive: true,
  });
  const other = info({
    id: 'abc12345',
    kind: 'server',
    name: 'Ink',
    subtitle: 'ink.example.com',
    icon: 'dns',
    hasCredentials: false,
  });

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  beforeEach(async () => {
    connections = signal<ProfileInfo[]>([current, other]);
    manager = {
      connections,
      activeConnection: () => connections().find(c => c.isActive) ?? null,
      switchTo: vi.fn().mockReturnValue('home'),
      disconnect: vi.fn().mockResolvedValue('welcome'),
    };
    dialog = { open: vi.fn(), closeAll: vi.fn() };
    gateway = {
      openProfileManagerDialog: vi.fn().mockResolvedValue(undefined),
    };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ConnectionSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProfileManagerService, useValue: manager },
        {
          provide: StorageContextService,
          useValue: {
            describeContextData: vi.fn().mockResolvedValue({
              prefix: 'cloud-dropbox-1:',
              databases: ['a', 'b'],
              localStorageKeys: ['c'],
            }),
          },
        },
        { provide: DialogGatewayService, useValue: gateway },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectionSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    window.location.href = '';
  });

  it('shows the current connection and the others', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-testid="current-connection"]')?.textContent
    ).toContain('Dropbox');
    expect(
      el.querySelector('[data-testid="other-connections"]')?.textContent
    ).toContain('Ink');
    expect(
      el.querySelector('[data-testid="switch-to-abc12345"]')
    ).not.toBeNull();
  });

  it('switches to another connection with a full reload', () => {
    component.switchTo(other);
    expect(manager.switchTo).toHaveBeenCalledWith('abc12345');
    expect(window.location.href).toBe('/');
  });

  it('ignores a switch to the active connection', () => {
    component.switchTo(current);
    expect(manager.switchTo).not.toHaveBeenCalled();
  });

  it('opens the connections manager', async () => {
    await component.manageConnections();
    expect(gateway.openProfileManagerDialog).toHaveBeenCalled();
  });

  it('closes dialogs and goes to the welcome screen', () => {
    component.goToWelcome();
    expect(dialog.closeAll).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/setup']);
  });

  describe('disconnectCurrent', () => {
    it('confirms with the data summary and disconnects', async () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });

      await component.disconnectCurrent();

      const data = dialog.open.mock.calls[0][1].data;
      expect(data.title).toContain('Dropbox');
      expect(data.details[0]).toContain('2 database');
      expect(data.requireConfirmationText).toBeUndefined();
      expect(manager.disconnect).toHaveBeenCalledWith('cloud-dropbox-1');
      expect(window.location.href).toBe('/setup');
    });

    it('requires typing DELETE for a browser connection', async () => {
      connections.set([
        info({ id: 'local', kind: 'local', name: 'Browser', isActive: true }),
      ]);
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });

      await component.disconnectCurrent();

      expect(dialog.open.mock.calls[0][1].data.requireConfirmationText).toBe(
        'DELETE'
      );
      expect(manager.disconnect).not.toHaveBeenCalled();
    });

    it('does nothing for the built-in connection', async () => {
      connections.set([
        info({ id: 'hosted', kind: 'server', isActive: true, isBuiltIn: true }),
      ]);
      fixture.detectChanges();

      await component.disconnectCurrent();

      expect(dialog.open).not.toHaveBeenCalled();
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="disconnect-current-button"]'
        )
      ).toBeNull();
    });

    it('lands on home when another connection remains', async () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      manager.disconnect.mockResolvedValue('home');

      await component.disconnectCurrent();

      expect(window.location.href).toBe('/');
    });
  });
});
