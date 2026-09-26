import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { form, FormField, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { DeleteAccountComponent } from '@components/delete-account/delete-account.component';
import { PasskeysSettingsComponent } from '@components/passkeys-settings/passkeys-settings.component';
import { ProfileVisibility } from '@inkweld/model/profile-visibility';
import type { UpdateProfileRequest } from '@inkweld/model/update-profile-request';
import { type UserAuthProvider } from '@inkweld/model/user';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';

interface AccountSettingsFormValue {
  displayName: string;
  email: string;
  bio: string;
  profileVisibility: ProfileVisibility;
  activityVisibility: ProfileVisibility;
  projectsVisibility: ProfileVisibility;
}

@Component({
  selector: 'app-account-settings',
  imports: [
    FormField,
    MatButtonModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    RouterLink,
    TranslocoModule,
    PasskeysSettingsComponent,
    DeleteAccountComponent,
  ],
  templateUrl: './account-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './account-settings.component.scss',
})
export class AccountSettingsComponent implements OnInit {
  readonly userService = inject(UserService);
  readonly systemConfig = inject(SystemConfigService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly isLocalMode = this.systemConfig.isLocalMode;
  readonly isSaving = signal(false);
  readonly authProvider = signal<UserAuthProvider | undefined>(undefined);

  readonly model = signal<AccountSettingsFormValue>({
    displayName: '',
    email: '',
    bio: '',
    profileVisibility: ProfileVisibility.Private,
    activityVisibility: ProfileVisibility.Public,
    projectsVisibility: ProfileVisibility.Private,
  });
  readonly form = form(this.model, schemaPath => {
    maxLength(schemaPath.bio, 500);
  });

  /** Profile-level choices, most open first. */
  readonly visibilityLevels: ProfileVisibility[] = [
    ProfileVisibility.Public,
    ProfileVisibility.Members,
    ProfileVisibility.Private,
  ];

  /**
   * Choices offered for a section. A section can never be wider than the
   * profile, so hide the levels that would be meaningless — e.g. a
   * members-only profile only offers "Members only" and "Private".
   */
  readonly sectionLevels = computed(() => {
    const idx = this.visibilityLevels.indexOf(this.profileLevel());
    return this.visibilityLevels.slice(Math.max(idx, 0));
  });
  /** Signal mirror of `profileVisibility` so `sectionLevels` can react. */
  private readonly profileLevel = signal<ProfileVisibility>(
    ProfileVisibility.Private
  );

  ngOnInit(): void {
    const user = this.userService.currentUser();
    this.model.set({
      displayName: user.name ?? '',
      email: user.email ?? '',
      bio: user.bio ?? '',
      profileVisibility: user.profileVisibility ?? ProfileVisibility.Private,
      activityVisibility: user.activityVisibility ?? ProfileVisibility.Public,
      projectsVisibility: user.projectsVisibility ?? ProfileVisibility.Private,
    });
    this.profileLevel.set(this.model().profileVisibility);
    this.authProvider.set(user.authProvider);
  }

  /**
   * Keep the section pickers valid when the profile level changes: a
   * section that was wider than the new profile level is pulled down to it.
   */
  onProfileVisibilityChange(level: ProfileVisibility): void {
    // Update the mirror first so sectionLevels() reflects the new profile.
    this.profileLevel.set(level);
    const allowed = this.sectionLevels();
    this.model.update(m => ({
      ...m,
      profileVisibility: level,
      activityVisibility: allowed.includes(m.activityVisibility)
        ? m.activityVisibility
        : level,
      projectsVisibility: allowed.includes(m.projectsVisibility)
        ? m.projectsVisibility
        : level,
    }));
  }

  /**
   * Diff the form against the current user and return only the fields that
   * changed, so a save never clobbers values edited elsewhere.
   */
  private collectChanges(): UpdateProfileRequest {
    const data: UpdateProfileRequest = {};
    const currentUser = this.userService.currentUser();
    const values = this.model();

    const newName = values.displayName.trim();
    if (newName !== (currentUser.name ?? '')) {
      data.name = newName;
    }
    if (this.isLocalMode()) {
      return data;
    }

    const newEmail = values.email.trim();
    if (newEmail !== (currentUser.email ?? '')) {
      data.email = newEmail;
    }
    const newBio = values.bio.trim();
    if (newBio !== (currentUser.bio ?? '')) {
      data.bio = newBio;
    }

    const levels: Array<
      [
        key: 'profileVisibility' | 'activityVisibility' | 'projectsVisibility',
        value: ProfileVisibility,
        fallback: ProfileVisibility,
      ]
    > = [
      [
        'profileVisibility',
        values.profileVisibility,
        ProfileVisibility.Private,
      ],
      [
        'activityVisibility',
        values.activityVisibility,
        ProfileVisibility.Public,
      ],
      [
        'projectsVisibility',
        values.projectsVisibility,
        ProfileVisibility.Private,
      ],
    ];
    for (const [key, value, fallback] of levels) {
      if (value !== (currentUser[key] ?? fallback)) {
        data[key] = value;
      }
    }
    return data;
  }

  async saveProfile(): Promise<void> {
    this.isSaving.set(true);

    try {
      const data = this.collectChanges();

      if (Object.keys(data).length === 0) {
        this.snackBar.open(
          this.transloco.translate('settings.accountTab.noChanges'),
          this.transloco.translate('close'),
          { duration: 2000 }
        );
        return;
      }

      await this.userService.updateProfile(data);
      this.snackBar.open(
        this.transloco.translate('settings.accountTab.profileUpdated'),
        this.transloco.translate('close'),
        { duration: 2000 }
      );
    } catch (err) {
      console.error('Failed to update profile:', err);
      let message = this.transloco.translate(
        'settings.accountTab.updateFailed'
      );
      if (
        err instanceof HttpErrorResponse &&
        err.error &&
        typeof err.error === 'object'
      ) {
        const body = err.error as Record<string, unknown>;
        if ('error' in body && typeof body['error'] === 'string') {
          message = body['error'];
        }
      }
      this.snackBar.open(message, this.transloco.translate('close'), {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }
}
