import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { UserService } from '@services/user.service';
import { ImageCroppedEvent, ImageCropperComponent } from 'ngx-image-cropper';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-edit-avatar-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    ImageCropperComponent,
  ],
  templateUrl: './edit-avatar-dialog.component.html',
  styleUrls: ['./edit-avatar-dialog.component.scss'],
})
export class EditAvatarDialogComponent {
  protected dialogRef = inject(MatDialogRef<EditAvatarDialogComponent>);
  private userService = inject(UserService);

  imageChangedEvent: Event | null = null;
  croppedImage: string = '';
  fileName = '';
  isSubmitting = false;

  fileChangeEvent(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.imageChangedEvent = event;
      this.fileName = input.files[0].name;
    }
  }

  imageCropped(event: ImageCroppedEvent) {
    this.croppedImage = event.base64!;
  }

  async submit(): Promise<void> {
    if (!this.croppedImage) {
      return;
    }
    this.isSubmitting = true;
    try {
      const blob = await (await fetch(this.croppedImage)).blob();
      const file = new File([blob], this.fileName, { type: blob.type });
      await firstValueFrom(this.userService.uploadAvatar(file));
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }
}
