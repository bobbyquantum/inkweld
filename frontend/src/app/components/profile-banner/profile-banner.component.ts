import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import { LoggerService } from '@services/core/logger.service';
import { UserProfileService } from '@services/user/user-profile.service';
import { firstValueFrom } from 'rxjs';

/**
 * A user's profile banner, rendered at the 3:1 ratio it was cropped to.
 *
 * The image is fetched as a blob and shown from an object URL rather than
 * pointed at directly (see `UserProfileService.getBanner` for why). Bumping
 * `version` re-fetches, which is how the page picks up a fresh upload. While
 * loading, or if the fetch fails, the element keeps its box but shows nothing,
 * so the layout around it does not jump.
 */
@Component({
  selector: 'app-profile-banner',
  template: `
    @if (src(); as url) {
      <img class="banner-image" [src]="url" [alt]="alt()" />
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      aspect-ratio: 3 / 1;
      overflow: hidden;
    }
    .banner-image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileBannerComponent {
  private readonly profileService = inject(UserProfileService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);

  readonly username = input.required<string>();
  /** Cache-buster; change it after an upload to re-fetch. */
  readonly version = input(0);
  readonly alt = input('');

  readonly src = signal<SafeUrl | null>(null);

  private objectUrl: string | null = null;
  /** Guards against a slow response for an earlier input overwriting a newer one. */
  private requestId = 0;
  /** A response landing after destroy must not create an object URL nobody will revoke. */
  private destroyed = false;

  constructor() {
    effect(() => {
      const username = this.username();
      const version = this.version();
      void this.load(username, version);
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.release();
    });
  }

  private async load(username: string, version: number): Promise<void> {
    const requestId = ++this.requestId;
    try {
      const blob = await firstValueFrom(
        this.profileService.getBanner(username, version)
      );
      if (this.destroyed || requestId !== this.requestId) return;
      this.release();
      this.objectUrl = URL.createObjectURL(blob);
      this.src.set(this.sanitizer.bypassSecurityTrustUrl(this.objectUrl)); // NOSONAR — object URL created from our own API response
    } catch (err) {
      if (this.destroyed || requestId !== this.requestId) return;
      this.logger.warn('ProfileBanner', 'Failed to load banner', err);
      this.release();
    }
  }

  private release(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.src.set(null);
  }
}
