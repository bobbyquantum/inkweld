import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MCPKeysService } from '@inkweld/api/mcp-keys.service';
import { McpPermission } from '@inkweld/index';
import { ProjectStateService } from '@services/project/project-state.service';
import { of, throwError } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import { CreateMcpKeyDialogComponent } from './create-mcp-key-dialog.component';

describe('CreateMcpKeyDialogComponent', () => {
  let component: CreateMcpKeyDialogComponent;
  let fixture: ComponentFixture<CreateMcpKeyDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<CreateMcpKeyDialogComponent>>;
  let mcpKeysService: MockedObject<MCPKeysService>;
  let projectState: MockedObject<ProjectStateService>;
  let snackBar: MockedObject<MatSnackBar>;

  const mockProject = {
    id: 'proj-1',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
  };

  beforeEach(async () => {
    dialogRef = { close: vi.fn() } as unknown as MockedObject<
      MatDialogRef<CreateMcpKeyDialogComponent>
    >;

    mcpKeysService = {
      createMcpKey: vi.fn().mockReturnValue(
        of({
          fullKey: 'mcp_full_key_value',
          key: {
            id: 'key-1',
            name: 'My Key',
            keyPrefix: 'mcp_prefix_',
            permissions: [McpPermission.Read],
            expiresAt: null,
            lastUsedAt: null,
            createdAt: 1704067200000,
            revoked: false,
          },
        })
      ),
    } as unknown as MockedObject<MCPKeysService>;

    projectState = {
      project: vi.fn().mockReturnValue(mockProject),
    } as unknown as MockedObject<ProjectStateService>;

    snackBar = { open: vi.fn() } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [CreateMcpKeyDialogComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MCPKeysService, useValue: mcpKeysService },
        { provide: ProjectStateService, useValue: projectState },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateMcpKeyDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('getExpirationTimestamp', () => {
    it('should return undefined for "never"', () => {
      (component as any).keyExpiration = 'never';
      const result = (component as any).getExpirationTimestamp() as
        | number
        | undefined;
      expect(result).toBeUndefined();
    });

    it('should return correct timestamp for "7days"', () => {
      const fixedNow = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
      (component as any).keyExpiration = '7days';
      const result = (component as any).getExpirationTimestamp() as number;
      expect(result).toBe(fixedNow + 7 * 24 * 60 * 60 * 1000);
    });

    it('should return correct timestamp for "30days"', () => {
      const fixedNow = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
      (component as any).keyExpiration = '30days';
      const result = (component as any).getExpirationTimestamp() as number;
      expect(result).toBe(fixedNow + 30 * 24 * 60 * 60 * 1000);
    });

    it('should return correct timestamp for "90days"', () => {
      const fixedNow = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
      (component as any).keyExpiration = '90days';
      const result = (component as any).getExpirationTimestamp() as number;
      expect(result).toBe(fixedNow + 90 * 24 * 60 * 60 * 1000);
    });
  });

  describe('permission management', () => {
    it('should toggle permission on and off', () => {
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(false);
      component.togglePermission(McpPermission.ReadProject);
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(true);
      component.togglePermission(McpPermission.ReadProject);
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(false);
    });

    it('should select all read permissions', () => {
      component.selectAllReadPermissions();
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(true);
      expect(component.hasPermission(McpPermission.ReadElements)).toBe(true);
      expect(component.hasPermission(McpPermission.ReadWorldbuilding)).toBe(
        true
      );
      expect(component.hasPermission(McpPermission.ReadSchemas)).toBe(true);
    });

    it('should select all write permissions', () => {
      component.selectAllWritePermissions();
      expect(component.hasPermission(McpPermission.WriteElements)).toBe(true);
      expect(component.hasPermission(McpPermission.WriteWorldbuilding)).toBe(
        true
      );
    });

    it('should select all permissions', () => {
      component.selectAllPermissions();
      expect((component as any).selectedPermissions().size).toBe(6);
    });

    it('should clear all permissions', () => {
      component.selectAllPermissions();
      component.clearPermissions();
      expect((component as any).selectedPermissions().size).toBe(0);
    });
  });

  describe('cancel', () => {
    it('should close dialog without value', () => {
      component.cancel();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });
  });

  describe('createKey', () => {
    it('should not call API if no key name', async () => {
      (component as any).keyName = '';
      component.togglePermission(McpPermission.ReadProject);
      await component.createKey();
      expect(mcpKeysService.createMcpKey).not.toHaveBeenCalled();
    });

    it('should not call API if no permissions selected', async () => {
      (component as any).keyName = 'My Key';
      component.clearPermissions();
      await component.createKey();
      expect(mcpKeysService.createMcpKey).not.toHaveBeenCalled();
    });

    it('should create key and close dialog on success', async () => {
      (component as any).keyName = 'My Key';
      component.togglePermission(McpPermission.ReadProject);
      await component.createKey();
      expect(mcpKeysService.createMcpKey).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith({
        fullKey: 'mcp_full_key_value',
        key: {
          id: 'key-1',
          name: 'My Key',
          keyPrefix: 'mcp_prefix_',
          permissions: [McpPermission.Read],
          expiresAt: null,
          lastUsedAt: null,
          createdAt: 1704067200000,
          revoked: false,
        },
      });
    });

    it('should show error snackbar on failure', async () => {
      mcpKeysService.createMcpKey.mockReturnValue(
        throwError(() => new Error('API error'))
      );
      (component as any).keyName = 'My Key';
      component.togglePermission(McpPermission.ReadProject);
      await component.createKey();
      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to create API key',
        'Close',
        expect.any(Object)
      );
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });
});
