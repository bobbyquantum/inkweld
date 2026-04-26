import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { Passkey } from '@inkweld/index';
import { PasskeyError, PasskeyService } from '@services/auth/passkey.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from 'vitest';

import { PasskeysSettingsComponent } from './passkeys-settings.component';

// ─── Fake data ────────────────────────────────────────────────────────────────

const fakePasskey: Passkey = {
  id: 'pk-1',
  name: 'Work laptop',
  deviceType: 'multiDevice',
  backedUp: true,
  createdAt: 1700000000,
};

const fakePasskey2: Passkey = {
  id: 'pk-2',
  name: 'Phone',
  deviceType: 'singleDevice',
  backedUp: false,
  createdAt: 1710000000,
  lastUsedAt: 1715000000,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PasskeysSettingsComponent', () => {
  let fixture: ComponentFixture<PasskeysSettingsComponent>;
  let component: PasskeysSettingsComponent;
  let passkeyService: MockedObject<PasskeyService>;
  let dialogGateway: MockedObject<DialogGatewayService>;
  let snackBar: MockedObject<MatSnackBar>;

  beforeEach(async () => {
    passkeyService = {
      isSupported: vi.fn().mockReturnValue(true),
      list: vi.fn().mockResolvedValue({ passkeys: [] }),
      register: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<PasskeyService>;

    dialogGateway = {
      openRenameDialog: vi.fn().mockResolvedValue(null),
      openConfirmationDialog: vi.fn().mockResolvedValue(false),
    } as unknown as MockedObject<DialogGatewayService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [PasskeysSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PasskeyService, useValue: passkeyService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PasskeysSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── ngOnInit / refresh ─────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('loads passkeys on init and clears loading state', async () => {
      passkeyService.list.mockResolvedValue({ passkeys: [fakePasskey] });
      fixture.detectChanges(); // triggers ngOnInit
      await fixture.whenStable();

      expect(passkeyService.list).toHaveBeenCalledOnce();
      expect(component.passkeys()).toEqual([fakePasskey]);
      expect(component.loading()).toBe(false);
    });

    it('sets error signal when list() rejects', async () => {
      passkeyService.list.mockRejectedValue(new Error('Server unavailable'));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.error()).toBe('Server unavailable');
      expect(component.loading()).toBe(false);
    });
  });

  // ── isSupported ────────────────────────────────────────────────────────────

  describe('isSupported', () => {
    it('is true when PasskeyService.isSupported() returns true', () => {
      passkeyService.isSupported.mockReturnValue(true);
      // re-create so the field is set with the new mock value
      fixture = TestBed.createComponent(PasskeysSettingsComponent);
      component = fixture.componentInstance;
      expect(component.isSupported).toBe(true);
    });

    it('is false when PasskeyService.isSupported() returns false', () => {
      passkeyService.isSupported.mockReturnValue(false);
      fixture = TestBed.createComponent(PasskeysSettingsComponent);
      component = fixture.componentInstance;
      expect(component.isSupported).toBe(false);
    });
  });

  // ── register() ─────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('calls passkeyService.register() and refreshes list on success', async () => {
      passkeyService.list
        .mockResolvedValueOnce({ passkeys: [] }) // initial load
        .mockResolvedValueOnce({ passkeys: [fakePasskey] }); // after register

      fixture.detectChanges();
      await fixture.whenStable();

      await component.register();

      expect(passkeyService.register).toHaveBeenCalledOnce();
      expect(passkeyService.list).toHaveBeenCalledTimes(2);
      expect(component.passkeys()).toEqual([fakePasskey]);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Passkey added.',
        'Dismiss',
        expect.any(Object)
      );
    });

    it('is silent when register() throws CANCELLED', async () => {
      passkeyService.register.mockRejectedValue(
        new PasskeyError('CANCELLED', 'Cancelled')
      );
      fixture.detectChanges();
      await fixture.whenStable();

      await component.register();

      expect(snackBar.open).not.toHaveBeenCalled();
    });

    it('shows snackbar when register() throws non-CANCELLED error', async () => {
      passkeyService.register.mockRejectedValue(new Error('Hardware error'));
      fixture.detectChanges();
      await fixture.whenStable();

      await component.register();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Hardware error',
        'Dismiss',
        expect.any(Object)
      );
    });

    it('shows snackbar and does not call API when browser unsupported', async () => {
      passkeyService.isSupported.mockReturnValue(false);
      fixture = TestBed.createComponent(PasskeysSettingsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();

      await component.register();

      expect(passkeyService.register).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith(
        'This browser does not support passkeys.',
        'Dismiss',
        expect.any(Object)
      );
    });

    it('clears registering signal after success', async () => {
      passkeyService.list.mockResolvedValue({ passkeys: [] });
      fixture.detectChanges();
      await fixture.whenStable();

      await component.register();

      expect(component.registering()).toBe(false);
    });

    it('clears registering signal after failure', async () => {
      passkeyService.register.mockRejectedValue(new Error('Fail'));
      fixture.detectChanges();
      await fixture.whenStable();

      await component.register();

      expect(component.registering()).toBe(false);
    });
  });

  // ── rename() ───────────────────────────────────────────────────────────────

  describe('rename()', () => {
    beforeEach(async () => {
      passkeyService.list.mockResolvedValue({ passkeys: [fakePasskey] });
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('renames passkey and updates list in place', async () => {
      dialogGateway.openRenameDialog.mockResolvedValue('New Name');

      await component.rename(fakePasskey);

      expect(passkeyService.rename).toHaveBeenCalledWith('pk-1', 'New Name');
      expect(component.passkeys()[0].name).toBe('New Name');
      expect(snackBar.open).toHaveBeenCalledWith(
        'Passkey renamed.',
        'Dismiss',
        expect.any(Object)
      );
    });

    it('does nothing when dialog returns null', async () => {
      dialogGateway.openRenameDialog.mockResolvedValue(null);

      await component.rename(fakePasskey);

      expect(passkeyService.rename).not.toHaveBeenCalled();
    });

    it('does nothing when new name is unchanged', async () => {
      dialogGateway.openRenameDialog.mockResolvedValue(fakePasskey.name!);

      await component.rename(fakePasskey);

      expect(passkeyService.rename).not.toHaveBeenCalled();
    });

    it('does nothing when new name is blank', async () => {
      dialogGateway.openRenameDialog.mockResolvedValue('   ');

      await component.rename(fakePasskey);

      expect(passkeyService.rename).not.toHaveBeenCalled();
    });

    it('shows snackbar on rename error', async () => {
      dialogGateway.openRenameDialog.mockResolvedValue('New Name');
      passkeyService.rename.mockRejectedValue(new Error('Rename failed'));

      await component.rename(fakePasskey);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Rename failed',
        'Dismiss',
        expect.any(Object)
      );
    });

    it('clears busyId after rename', async () => {
      dialogGateway.openRenameDialog.mockResolvedValue('New Name');

      await component.rename(fakePasskey);

      expect(component.busyId()).toBeNull();
    });
  });

  // ── delete() ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    beforeEach(async () => {
      passkeyService.list.mockResolvedValue({
        passkeys: [fakePasskey, fakePasskey2],
      });
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('deletes passkey and removes it from list', async () => {
      dialogGateway.openConfirmationDialog.mockResolvedValue(true);

      await component.delete(fakePasskey);

      expect(passkeyService.delete).toHaveBeenCalledWith('pk-1');
      expect(component.passkeys()).toEqual([fakePasskey2]);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Passkey deleted.',
        'Dismiss',
        expect.any(Object)
      );
    });

    it('does nothing when confirmation dialog is cancelled', async () => {
      dialogGateway.openConfirmationDialog.mockResolvedValue(false);

      await component.delete(fakePasskey);

      expect(passkeyService.delete).not.toHaveBeenCalled();
    });

    it('shows snackbar on delete error', async () => {
      dialogGateway.openConfirmationDialog.mockResolvedValue(true);
      passkeyService.delete.mockRejectedValue(new Error('Delete failed'));

      await component.delete(fakePasskey);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Delete failed',
        'Dismiss',
        expect.any(Object)
      );
    });

    it('clears busyId after delete', async () => {
      dialogGateway.openConfirmationDialog.mockResolvedValue(true);

      await component.delete(fakePasskey);

      expect(component.busyId()).toBeNull();
    });
  });

  // ── formatDate() ───────────────────────────────────────────────────────────

  describe('formatDate()', () => {
    it('returns em-dash for null', () => {
      expect(component.formatDate(null)).toBe('—');
    });

    it('returns em-dash for undefined', () => {
      expect(component.formatDate(undefined)).toBe('—');
    });

    it('returns em-dash for 0', () => {
      expect(component.formatDate(0)).toBe('—');
    });

    it('converts seconds to milliseconds before formatting', () => {
      // 1700000000 seconds = Nov 14, 2023
      const result = component.formatDate(1700000000);
      expect(result).toMatch(/2023/);
    });
  });

  // ── isBusy() ───────────────────────────────────────────────────────────────

  describe('isBusy()', () => {
    it('returns false when no passkey is busy', () => {
      expect(component.isBusy('pk-1')).toBe(false);
    });
  });

  // ── hasPasskeys computed ────────────────────────────────────────────────────

  describe('hasPasskeys', () => {
    it('is false when passkeys list is empty', async () => {
      passkeyService.list.mockResolvedValue({ passkeys: [] });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.hasPasskeys()).toBe(false);
    });

    it('is true when passkeys list has items', async () => {
      passkeyService.list.mockResolvedValue({ passkeys: [fakePasskey] });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.hasPasskeys()).toBe(true);
    });
  });
});
