import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Role values shared by the OAuth consent and authorized-apps flows.
 */
export type GrantRole = 'viewer' | 'editor' | 'admin';

/**
 * A single project grant rendered by {@link ProjectGrantListComponent}.
 * `selected` is only used when `showSelect` (consent mode) is enabled.
 */
export interface ProjectGrantRow {
  projectId: string;
  projectTitle: string;
  projectSlug: string;
  role: GrantRole;
  selected?: boolean;
}

/**
 * Shared "project + access level" editing primitive.
 *
 * The OAuth consent page (pick projects to grant) and the Authorized Apps
 * management UI (edit per-project access for an existing session) both render
 * the same unit of UI: a project row with a role selector. This component is
 * the single source of that UI, so the two flows stay in sync and role labels
 * are consistent. It also hosts the optional "all projects + default role"
 * toggle so that feature surfaces in both places.
 */
@Component({
  selector: 'app-project-grant-list',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './project-grant-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './project-grant-list.component.scss',
})
export class ProjectGrantListComponent {
  /** The project grants to render. */
  readonly grants = input<ProjectGrantRow[]>([]);

  /** Show a selectable checkbox on each row (consent mode). */
  readonly showSelect = input(false);

  /** Show a remove button on each row (management mode). */
  readonly showRemove = input(false);

  /** Disable role/selection editing (e.g. while a request is in flight). */
  readonly readonly = input(false);

  /** Whether to show the "all projects" + default role section. */
  readonly showAllProjects = input(false);

  /** Current "access all projects" state. */
  readonly accessAllProjects = input(false);

  /** Current default role for all-projects mode. */
  readonly defaultRole = input<GrantRole>('viewer');

  /** Disable the all-projects toggle (e.g. while a request is in flight). */
  readonly allProjectsDisabled = input(false);

  /** Emitted when a grant's role changes. */
  readonly roleChange = output<{ projectId: string; role: GrantRole }>();

  /** Emitted when a grant's selection toggles (consent mode). */
  readonly selectionChange = output<{ projectId: string; selected: boolean }>();

  /** Emitted when a grant's remove button is clicked. */
  readonly remove = output<string>();

  /** Emitted when the all-projects toggle or default role changes. */
  readonly allProjectsChange = output<{
    accessAllProjects: boolean;
    defaultRole: GrantRole;
  }>();

  readonly roles: GrantRole[] = ['viewer', 'editor', 'admin'];

  /** Return the i18n key for a role label. */
  getRoleLabel(role: GrantRole): string {
    switch (role) {
      case 'viewer':
        return 'auth.oauthConsent.viewOnly';
      case 'editor':
        return 'auth.oauthConsent.viewAndEdit';
      case 'admin':
        return 'auth.oauthConsent.fullAccess';
    }
  }

  onRoleChange(projectId: string, role: GrantRole): void {
    this.roleChange.emit({ projectId, role });
  }

  onSelectionChange(projectId: string, selected: boolean): void {
    this.selectionChange.emit({ projectId, selected });
  }

  onAllProjectsToggle(checked: boolean): void {
    this.allProjectsChange.emit({
      accessAllProjects: checked,
      defaultRole: this.defaultRole(),
    });
  }

  onDefaultRoleChange(role: GrantRole): void {
    this.allProjectsChange.emit({
      accessAllProjects: true,
      defaultRole: role,
    });
  }
}
