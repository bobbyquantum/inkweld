import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MCPKeysService } from '@inkweld/api/mcp-keys.service';
import {
  CreateMcpKeyRequest,
  McpPermission,
  McpPublicKey,
} from '@inkweld/index';
import { ProjectStateService } from '@services/project/project-state.service';
import { firstValueFrom } from 'rxjs';

/**
 * Permission group for easier selection in UI
 */
interface PermissionGroup {
  label: string;
  permissions: {
    permission: McpPermission;
    label: string;
    description: string;
  }[];
}

/**
 * Result returned when a key is successfully created
 */
export interface CreateMcpKeyDialogResult {
  fullKey: string;
  key: McpPublicKey;
}

@Component({
  selector: 'app-create-mcp-key-dialog',
  templateUrl: './create-mcp-key-dialog.component.html',
  styleUrls: ['./create-mcp-key-dialog.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
  ],
})
export class CreateMcpKeyDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<CreateMcpKeyDialogComponent>
  );
  private readonly mcpKeysService = inject(MCPKeysService);
  private readonly projectState = inject(ProjectStateService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly isCreating = signal(false);
  protected readonly selectedPermissions = signal<Set<McpPermission>>(
    new Set()
  );

  protected keyName = '';
  protected keyExpiration: 'never' | '7days' | '30days' | '90days' = 'never';

  protected readonly permissionGroups: PermissionGroup[] = [
    {
      label: 'Read Permissions',
      permissions: [
        {
          permission: McpPermission.ReadProject,
          label: 'Project',
          description: 'Read project metadata',
        },
        {
          permission: McpPermission.ReadElements,
          label: 'Elements',
          description: 'Read project tree/elements',
        },
        {
          permission: McpPermission.ReadWorldbuilding,
          label: 'Worldbuilding',
          description: 'Read worldbuilding data',
        },
        {
          permission: McpPermission.ReadSchemas,
          label: 'Schemas',
          description: 'Read custom schemas',
        },
      ],
    },
    {
      label: 'Write Permissions',
      permissions: [
        {
          permission: McpPermission.WriteElements,
          label: 'Elements',
          description: 'Create/modify elements',
        },
        {
          permission: McpPermission.WriteWorldbuilding,
          label: 'Worldbuilding',
          description: 'Modify worldbuilding data',
        },
      ],
    },
  ];

  togglePermission(permission: McpPermission): void {
    this.selectedPermissions.update(perms => {
      const newPerms = new Set(perms);
      if (newPerms.has(permission)) {
        newPerms.delete(permission);
      } else {
        newPerms.add(permission);
      }
      return newPerms;
    });
  }

  hasPermission(permission: McpPermission): boolean {
    return this.selectedPermissions().has(permission);
  }

  selectAllReadPermissions(): void {
    this.selectedPermissions.update(perms => {
      const newPerms = new Set(perms);
      this.permissionGroups[0].permissions.forEach(p =>
        newPerms.add(p.permission)
      );
      return newPerms;
    });
  }

  selectAllWritePermissions(): void {
    this.selectedPermissions.update(perms => {
      const newPerms = new Set(perms);
      this.permissionGroups[1].permissions.forEach(p =>
        newPerms.add(p.permission)
      );
      return newPerms;
    });
  }

  selectAllPermissions(): void {
    this.selectedPermissions.update(() => {
      const newPerms = new Set<McpPermission>();
      this.permissionGroups.forEach(group => {
        group.permissions.forEach(p => newPerms.add(p.permission));
      });
      return newPerms;
    });
  }

  clearPermissions(): void {
    this.selectedPermissions.set(new Set());
  }

  async createKey(): Promise<void> {
    const project = this.projectState.project();
    if (
      !project ||
      !this.keyName.trim() ||
      this.selectedPermissions().size === 0
    ) {
      return;
    }

    this.isCreating.set(true);

    try {
      const request: CreateMcpKeyRequest = {
        name: this.keyName.trim(),
        permissions: Array.from(this.selectedPermissions()),
        expiresAt: this.getExpirationTimestamp(),
      };

      const response = await firstValueFrom(
        this.mcpKeysService.createMcpKey(
          project.username,
          project.slug,
          request
        )
      );

      this.snackBar.open('API key created successfully', 'Close', {
        duration: 3000,
      });

      this.dialogRef.close({
        fullKey: response.fullKey,
        key: response.key,
      } as CreateMcpKeyDialogResult);
    } catch (error) {
      console.error('Failed to create API key:', error);
      this.snackBar.open('Failed to create API key', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isCreating.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private getExpirationTimestamp(): number | undefined {
    if (this.keyExpiration === 'never') {
      return undefined;
    }
    const now = Date.now();
    const days = parseInt(this.keyExpiration.replace('days', ''), 10);
    return now + days * 24 * 60 * 60 * 1000;
  }
}
