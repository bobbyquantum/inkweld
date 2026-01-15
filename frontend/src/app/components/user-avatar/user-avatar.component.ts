import {
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  signal,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { LocalStorageService } from '@services/local/local-storage.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import { generateFracticonDataURL } from 'fracticons';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [],
  templateUrl: './user-avatar.component.html',
  styleUrls: ['./user-avatar.component.scss'],
})
export class UserAvatarComponent implements OnInit, OnChanges, OnDestroy {
  private unifiedUserService = inject(UnifiedUserService);
  private userService = inject(UserService);
  private localStorage = inject(LocalStorageService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  @Input() username!: string;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  /** When false, skip server request and use fallback directly. Undefined = unknown, try server. */
  @Input() hasAvatar?: boolean;

  protected avatarUrl: SafeUrl | undefined;
  protected fallbackAvatarUrl: string | undefined;
  protected readonly isLoading = signal(false);
  protected error = false;

  private currentObjectUrl: string | undefined;
  private avatarSubscription: Subscription | undefined;

  ngOnInit() {
    void this.loadAvatar();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['username'] || changes['hasAvatar']) {
      void this.loadAvatar();
    }
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private cleanup(): void {
    // Revoke object URL to prevent memory leaks
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = undefined;
    }
    // Cancel any pending subscription
    if (this.avatarSubscription) {
      this.avatarSubscription.unsubscribe();
      this.avatarSubscription = undefined;
    }
  }

  private generateFallbackAvatar(): void {
    if (!this.username) return;

    // Generate a deterministic fractal avatar based on username
    const size = this.size === 'small' ? 64 : this.size === 'medium' ? 96 : 256;
    this.fallbackAvatarUrl = generateFracticonDataURL(this.username, {
      size,
      circular: true,
    });
  }

  public async loadAvatar() {
    if (!this.username) return;

    // Clean up previous resources
    this.cleanup();

    // Always generate fallback avatar first
    this.generateFallbackAvatar();

    // If we know the user has no avatar, use fallback directly without server request
    if (this.hasAvatar === false) {
      this.error = true;
      this.isLoading.set(false);
      this.cdr.detectChanges();
      return;
    }

    const mode = this.unifiedUserService.getMode();

    // In offline mode, try to load from IndexedDB cache
    if (mode === 'local') {
      await this.loadFromOfflineCache();
      return;
    }

    // In server mode, first try local cache, then fall back to server
    this.isLoading.set(true);
    this.error = false;
    this.avatarUrl = undefined;

    // First try to load from local cache (faster and works if server is slow)
    const cachedUrl = await this.localStorage.getUserAvatarUrl(this.username);
    if (cachedUrl) {
      this.avatarUrl = this.sanitizer.bypassSecurityTrustUrl(cachedUrl);
      this.error = false;
      this.isLoading.set(false);
      this.cdr.detectChanges();
      return;
    }

    // Try to load avatar from server
    this.avatarSubscription = this.userService
      .getUserAvatar(this.username)
      .subscribe({
        next: (blob: Blob) => {
          void (async () => {
            if (blob && blob.size > 0) {
              // Cache the avatar locally for offline access
              await this.localStorage.saveUserAvatar(this.username, blob);
              this.currentObjectUrl = URL.createObjectURL(blob);
              this.avatarUrl = this.sanitizer.bypassSecurityTrustUrl(
                this.currentObjectUrl
              );
              this.error = false;
            } else {
              // Empty blob means no avatar, use fallback
              this.error = true;
            }
            this.isLoading.set(false);
            this.cdr.detectChanges();
          })();
        },
        error: () => {
          this.error = true;
          this.isLoading.set(false);
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Load avatar from IndexedDB cache (for offline mode)
   */
  private async loadFromOfflineCache(): Promise<void> {
    this.isLoading.set(true);
    this.error = false;
    this.avatarUrl = undefined;

    try {
      const url = await this.localStorage.getUserAvatarUrl(this.username);
      if (url) {
        this.avatarUrl = this.sanitizer.bypassSecurityTrustUrl(url);
        this.error = false;
      } else {
        // No cached avatar, use fallback
        this.error = true;
      }
    } catch (err) {
      console.warn('Failed to load avatar from cache:', err);
      this.error = true;
    } finally {
      this.isLoading.set(false);
      this.cdr.detectChanges();
    }
  }
}
