import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  ACCOUNT_DELETED_URL,
  DeleteAccountComponent,
} from './delete-account.component';

describe('DeleteAccountComponent', () => {
  let fixture: ComponentFixture<DeleteAccountComponent>;
  let component: DeleteAccountComponent;
  let userService: {
    currentUser: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
  };
  let dialogGateway: { openConfirmationDialog: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let systemFeatures: ReturnType<typeof vi.fn>;
  let activeConfig: ReturnType<typeof vi.fn>;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    userService = {
      currentUser: vi.fn().mockReturnValue({ id: '1', username: 'alice' }),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
    };
    dialogGateway = {
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };
    snackBar = { open: vi.fn() };
    systemFeatures = vi.fn().mockReturnValue({});
    activeConfig = vi.fn().mockReturnValue({
      id: 'abc',
      type: 'server',
      serverUrl: 'https://write.example.com',
    });
    assign = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, assign });

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), DeleteAccountComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserService, useValue: userService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: SystemConfigService, useValue: { systemFeatures } },
        {
          provide: StorageContextService,
          useValue: { getActiveConfig: activeConfig },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteAccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the server by its host when no name is configured', () => {
    expect(component.serverName()).toBe('write.example.com');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('write.example.com');
  });

  it("prefers the server's configured name", () => {
    systemFeatures.mockReturnValue({ defaultServerName: 'Quill Club' });
    fixture = TestBed.createComponent(DeleteAccountComponent);
    expect(fixture.componentInstance.serverName()).toBe('Quill Club');
  });

  it('asks the user to type their username before deleting', async () => {
    await component.deleteAccount();

    expect(dialogGateway.openConfirmationDialog).toHaveBeenCalledWith(
      expect.objectContaining({ requireConfirmationText: 'alice' })
    );
    expect(userService.deleteAccount).toHaveBeenCalledWith('alice');
    expect(assign).toHaveBeenCalledWith(ACCOUNT_DELETED_URL);
  });

  it('does nothing when the confirmation is cancelled', async () => {
    dialogGateway.openConfirmationDialog.mockResolvedValue(false);

    await component.deleteAccount();

    expect(userService.deleteAccount).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the server's reason when deletion is refused", async () => {
    userService.deleteAccount.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: { error: 'You are the only administrator.' },
      })
    );

    await component.deleteAccount();

    expect(snackBar.open).toHaveBeenCalledWith(
      'You are the only administrator.',
      'Close',
      expect.anything()
    );
    expect(component.isDeleting()).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for other failures', async () => {
    userService.deleteAccount.mockRejectedValue(new Error('offline'));

    await component.deleteAccount();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Could not delete your account. Please try again.',
      'Close',
      expect.anything()
    );
  });
});
