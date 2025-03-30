import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';

import { FileSizePipe } from '../../pipes/file-size.pipe';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { ProjectFile } from '../../services/project-file.service';

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [MatTableModule, MatButtonModule, MatIconModule, FileSizePipe],
  templateUrl: './file-list.component.html',
  styleUrls: ['./file-list.component.scss'],
})
export class FileListComponent {
  private dialogGateway = inject(DialogGatewayService);

  @Input({ required: true }) files: ProjectFile[] = [];
  @Output() deleteFile = new EventEmitter<ProjectFile>();

  protected columns = ['name', 'size', 'type', 'actions'];

  /**
   * Check if a file is an image based on its content type
   */
  isImage(file: ProjectFile): boolean {
    // Check for proper MIME types
    if (file.contentType.startsWith('image/')) {
      return true;
    }

    // Also check for common image extensions that might not have proper MIME types
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
    return imageExtensions.includes(file.contentType.toLowerCase());
  }

  /**
   * Open image viewer dialog for image files
   */
  viewImage(file: ProjectFile): void {
    if (this.isImage(file) && file.fileUrl) {
      this.dialogGateway.openImageViewerDialog({
        imageUrl: file.fileUrl,
        fileName: file.originalName,
      });
    }
  }
}
