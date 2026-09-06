import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { BackgroundPickerComponent } from '@components/background-picker/background-picker.component';
import { PasskeysSettingsComponent } from '@components/passkeys-settings/passkeys-settings.component';
import { ProfileVisibility } from '@inkweld/model/profile-visibility';
import type { UpdateProfileRequest } from '@inkweld/model/update-profile-request';
import { type UserAuthProvider } from '@inkweld/model/user';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';

@Component({
  selector: 'app-account-settings',
  imports: [
    FormsModule,
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
    BackgroundPickerComponent,
    PasskeysSettingsComponent,
  ],
  templateUrl: './account-settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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

  displayName = '';
  email = '';
  bio = '';
  profileVisibility: ProfileVisibility = ProfileVisibility.Private;
  activityVisibility: ProfileVisibility = ProfileVisibility.Public;
  projectsVisibility: ProfileVisibility = ProfileVisibility.Private;

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
    this.displayName = user.name ?? '';
    this.email = user.email ?? '';
    this.bio = user.bio ?? '';
    this.profileVisibility =
      user.profileVisibility ?? ProfileVisibility.Private;
    this.activityVisibility =
      user.activityVisibility ?? ProfileVisibility.Public;
    this.projectsVisibility =
      user.projectsVisibility ?? ProfileVisibility.Private;
    this.profileLevel.set(this.profileVisibility);
    this.authProvider.set(user.authProvider);
  }

  /**
   * Keep the section pickers valid when the profile level changes: a
   * section that was wider than the new profile level is pulled down to it.
   */
  onProfileVisibilityChange(level: ProfileVisibility): void {
    this.profileVisibility = level;
    this.profileLevel.set(level);
    const allowed = this.sectionLevels();
    if (!allowed.includes(this.activityVisibility)) {
      this.activityVisibility = level;
    }
    if (!allowed.includes(this.projectsVisibility)) {
      this.projectsVisibility = level;
    }
  }

  /**
   * Diff the form against the current user and return only the fields that
   * changed, so a save never clobbers values edited elsewhere.
   */
  private collectChanges(): UpdateProfileRequest {
    const data: UpdateProfileRequest = {};
    const currentUser = this.userService.currentUser();

    const newName = this.displayName.trim();
    if (newName !== (currentUser.name ?? '')) {
      data.name = newName;
    }
    if (this.isLocalMode()) {
      return data;
    }

    const newEmail = this.email.trim();
    if (newEmail !== (currentUser.email ?? '')) {
      data.email = newEmail;
    }
    const newBio = this.bio.trim();
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
      ['profileVisibility', this.profileVisibility, ProfileVisibility.Private],
      ['activityVisibility', this.activityVisibility, ProfileVisibility.Public],
      [
        'projectsVisibility',
        this.projectsVisibility,
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
