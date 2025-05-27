import {
  Component,
  inject,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UnifiedUserService } from '@services/unified-user.service';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [],
  templateUrl: './user-avatar.component.html',
  styleUrls: ['./user-avatar.component.scss'],
})
export class UserAvatarComponent implements OnInit, OnChanges {
  private userService = inject(UnifiedUserService);
  private sanitizer = inject(DomSanitizer);

  @Input() username!: string;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  protected avatarUrl: SafeUrl | undefined;
  protected isLoading = false;
  protected error = false;

  ngOnInit() {
    void this.loadAvatar();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['username']) {
      void this.loadAvatar();
    }
  }

  public loadAvatar() {
    console.log('Loading avatar for user:', this.username);
    if (!this.username) return;

    // Skip avatar loading in offline mode
    const mode = this.userService.getMode();
    if (mode === 'offline') {
      console.log('Skipping avatar loading in offline mode');
      this.error = true; // Show default avatar
      return;
    }

    this.isLoading = true;
    this.error = false;

    try {
      // Only try to load avatars in server mode
      // For now, we'll just show default avatars since UnifiedUserService
      // doesn't have getUserAvatar method yet
      this.error = true; // Show default avatar for now
    } catch (error) {
      console.error('Error loading avatar:', error);
      this.error = true;
    } finally {
      this.isLoading = false;
    }
  }
}
