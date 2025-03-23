import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UserService } from '@services/user.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [],
  templateUrl: './user-avatar.component.html',
  styleUrls: ['./user-avatar.component.scss'],
})
export class UserAvatarComponent implements OnInit, OnChanges {
  @Input() username!: string;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  protected avatarUrl: SafeUrl | undefined;
  protected isLoading = false;
  protected error = false;

  constructor(
    private userService: UserService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    void this.loadAvatar();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['username']) {
      void this.loadAvatar();
    }
  }

  private async loadAvatar() {
    console.log('Loading avatar for user:', this.username);
    if (!this.username) return;

    this.isLoading = true;
    this.error = false;

    try {
      const blob = await firstValueFrom(
        this.userService.getUserAvatar(this.username)
      );

      if (blob && blob.size > 0) {
        const objectUrl = URL.createObjectURL(blob);
        this.avatarUrl = this.sanitizer.bypassSecurityTrustUrl(objectUrl);
      } else {
        this.error = true;
      }
    } catch (error) {
      console.error('Error loading avatar:', error);
      this.error = true;
    } finally {
      this.isLoading = false;
    }
  }
}
