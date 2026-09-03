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
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  AdminAppearanceService,
  type BrandingSurface,
} from '@services/admin/admin-appearance.service';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { BackgroundService } from '@services/core/background.service';

/** Config keys backing one surface's settings. */
const SURFACE_KEYS: Record<BrandingSurface, { asset: string; url: string }> = {
  login: { asset: 'LOGIN_BACKGROUND_ASSET', url: 'LOGIN_BACKGROUND_URL' },
  home: { asset: 'HOME_BACKGROUND_ASSET', url: 'HOME_BACKGROUND_URL' },
};

/** Client-side guard mirroring the backend's cap, for a fast, clear error. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Admin appearance settings: the login and home background images, their
 * treatment, and whether users may personalise their own.
 */
@Component({
  selector: 'app-admin-appearance',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './appearance.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './appearance.component.scss',
})
export class AdminAppearanceComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly appearanceService = inject(AdminAppearanceService);
  private readonly backgroundService = inject(BackgroundService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<Error | null>(null);

  /** Whether each surface currently has an uploaded image. */
  readonly hasLoginAsset = signal(false);
  readonly hasHomeAsset = signal(false);

  readonly loginUrl = signal('');
  readonly homeUrl = signal('');

  /** Empty string means "keep the per-theme defaults". */
  readonly overlayOpacity = signal('');
  readonly blur = signal(0);

  readonly userBackgroundEnabled = signal(true);
  readonly userBackgroundUploadEnabled = signal(false);

  /** Live preview images, resolved the same way the app resolves them. */
  readonly loginPreview = computed(() =>
    this.previewFor('login', this.hasLoginAsset(), this.loginUrl())
  );
  readonly homePreview = computed(() =>
    this.previewFor('home', this.hasHomeAsset(), this.homeUrl())
  );

  /**
   * The login surface inherits the home background when it has nothing of its
   * own, so the UI can say so rather than leaving an admin guessing.
   */
  readonly loginInheritsHome = computed(
    () => !this.hasLoginAsset() && !this.loginUrl().trim()
  );

  /** Uploads are meaningless while personalisation as a whole is off. */
  readonly canEnableUploads = computed(() => this.userBackgroundEnabled());

  ngOnInit(): void {
    void this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const [
        loginAsset,
        homeAsset,
        loginUrl,
        homeUrl,
        overlay,
        blur,
        userEnabled,
        uploadEnabled,
      ] = await Promise.all([
        this.configService.getConfig(SURFACE_KEYS.login.asset),
        this.configService.getConfig(SURFACE_KEYS.home.asset),
        this.configService.getConfig(SURFACE_KEYS.login.url),
        this.configService.getConfig(SURFACE_KEYS.home.url),
        this.configService.getConfig('BACKGROUND_OVERLAY_OPACITY'),
        this.configService.getConfig('BACKGROUND_BLUR'),
        this.configService.getConfig('USER_BACKGROUND_ENABLED'),
        this.configService.getConfig('USER_BACKGROUND_UPLOAD_ENABLED'),
      ]);

      this.hasLoginAsset.set(!!loginAsset?.value.trim());
      this.hasHomeAsset.set(!!homeAsset?.value.trim());
      this.loginUrl.set(loginUrl?.value ?? '');
      this.homeUrl.set(homeUrl?.value ?? '');
      this.overlayOpacity.set(overlay?.value ?? '');
      this.blur.set(Number(blur?.value ?? '0') || 0);
      this.userBackgroundEnabled.set(userEnabled?.value !== 'false');
      this.userBackgroundUploadEnabled.set(uploadEnabled?.value === 'true');
    } catch (error) {
      this.error.set(
        error instanceof Error ? error : new Error('Failed to load settings')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Upload a background image for one surface. */
  async onFileSelected(surface: BrandingSurface, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear immediately so re-picking the same file fires a fresh change event.
    input.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      this.notify('admin.appearance.invalidType');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      this.notify('admin.appearance.tooLarge');
      return;
    }

    this.isSaving.set(true);
    try {
      await this.appearanceService.uploadBackground(surface, file, file.name);
      this.setAssetFlag(surface, true);
      await this.refreshLive();
      this.notify('admin.appearance.uploaded');
    } catch {
      this.notify('admin.appearance.uploadFailed');
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Remove the uploaded image, falling back to the URL then the default. */
  async removeImage(surface: BrandingSurface): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.appearanceService.deleteBackground(surface);
      this.setAssetFlag(surface, false);
      await this.refreshLive();
      this.notify('admin.appearance.removed');
    } catch {
      this.notify('admin.appearance.removeFailed');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveUrl(surface: BrandingSurface, value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed && !/^https?:\/\/\S+$/.test(trimmed)) {
      this.notify('admin.appearance.invalidUrl');
      return;
    }

    if (surface === 'login') {
      this.loginUrl.set(trimmed);
    } else {
      this.homeUrl.set(trimmed);
    }

    await this.saveKey(SURFACE_KEYS[surface].url, trimmed);
  }

  async saveOverlayOpacity(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0.95) {
        this.notify('admin.appearance.invalidOpacity');
        return;
      }
    }
    this.overlayOpacity.set(trimmed);
    await this.saveKey('BACKGROUND_OVERLAY_OPACITY', trimmed);
  }

  async saveBlur(value: number): Promise<void> {
    this.blur.set(value);
    await this.saveKey('BACKGROUND_BLUR', String(value));
  }

  async toggleUserBackground(enabled: boolean): Promise<void> {
    this.userBackgroundEnabled.set(enabled);
    await this.saveKey('USER_BACKGROUND_ENABLED', String(enabled));
  }

  async toggleUserUpload(enabled: boolean): Promise<void> {
    this.userBackgroundUploadEnabled.set(enabled);
    await this.saveKey('USER_BACKGROUND_UPLOAD_ENABLED', String(enabled));
  }

  private async saveKey(key: string, value: string): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(key, value);
      await this.refreshLive();
      this.notify('admin.appearance.saved');
    } catch {
      this.notify('admin.appearance.saveFailed');
      // Re-read rather than guess what the server kept.
      await this.loadConfig();
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Re-resolve the live background so the admin sees the change applied. */
  private async refreshLive(): Promise<void> {
    await this.backgroundService.refresh({ authenticated: true });
  }

  private setAssetFlag(surface: BrandingSurface, value: boolean): void {
    if (surface === 'login') {
      this.hasLoginAsset.set(value);
    } else {
      this.hasHomeAsset.set(value);
    }
  }

  /**
   * A CSS `background-image` for the preview tile. Uploaded assets are read
   * through the live appearance config so the cache-busting token matches.
   */
  private previewFor(
    surface: BrandingSurface,
    hasAsset: boolean,
    url: string
  ): string {
    if (hasAsset) {
      const resolved = this.backgroundService.appearance()?.[surface];
      if (resolved?.source === 'asset' && resolved.value) {
        return `url("${resolved.value}")`;
      }
    }

    const trimmed = url.trim();
    if (trimmed && /^https?:\/\/[^"'()\s\\]+$/.test(trimmed)) {
      return `url("${trimmed}")`;
    }

    if (surface === 'login' && !hasAsset && !trimmed) {
      // Mirror the inheritance so the preview does not claim the bundled image
      // when the home surface is actually what will show.
      return this.previewFor('home', this.hasHomeAsset(), this.homeUrl());
    }

    return "url('/home_background.png')";
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), undefined, {
      duration: 3000,
    });
  }
}
