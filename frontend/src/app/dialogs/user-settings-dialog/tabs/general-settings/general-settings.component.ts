import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { UserService } from '@services/user.service';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
  selector: 'app-general-settings',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
  ],
  templateUrl: './general-settings.component.html',
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
  selectedTheme!: ThemeOption;
  avatarUrl: string | null = null;
  isUploadingAvatar = false;

  private themeSubscription!: Subscription;
  private themeService = inject(ThemeService);
  private userService = inject(UserService);

  ngOnInit() {
    this.themeSubscription = this.themeService
      .getCurrentTheme()
      .subscribe(theme => {
        this.selectedTheme = theme;
      });
    void this.loadAvatar();
  }

  ngOnDestroy() {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }

  onThemeChange() {
    this.themeService.update(this.selectedTheme);
  }

  async loadAvatar() {
    const currentUser = this.userService.currentUser();
    if (currentUser?.username) {
      try {
        const blob = await firstValueFrom(
          this.userService.getUserAvatar(currentUser.username)
        );
        this.avatarUrl = URL.createObjectURL(blob);
      } catch (error) {
        console.warn('Failed to load avatar:', error);
      }
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      alert('File is too large. Maximum size is 5MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed.');
      return;
    }

    try {
      this.isUploadingAvatar = true;
      await firstValueFrom(this.userService.uploadAvatar(file));
      await this.loadAvatar();
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      this.isUploadingAvatar = false;
      // Clear the input
      input.value = '';
    }
  }

  async deleteAvatar() {
    try {
      await firstValueFrom(this.userService.deleteAvatar());
      this.avatarUrl = null;
    } catch (error) {
      console.error('Failed to delete avatar:', error);
      alert('Failed to delete avatar. Please try again.');
    }
  }
}
