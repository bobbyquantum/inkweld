import { inject, Injectable } from '@angular/core';
import {
  FileMetadataDto,
  FileUploadResponseDto,
  ProjectFilesService,
} from '@inkweld/index';
import { map, Observable } from 'rxjs';

export interface ProjectFile {
  originalName: string;
  storedName: string;
  contentType: string;
  size: number;
  uploadDate: Date;
  fileUrl?: string;
}

export interface FileDeleteResponse {
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectFileService {
  private projectFilesService = inject(ProjectFilesService);

  getProjectFiles(
    username: string,
    projectSlug: string
  ): Observable<ProjectFile[]> {
    return this.projectFilesService
      .projectFilesControllerListFiles(username, projectSlug)
      .pipe(
        map((files: FileMetadataDto[]) =>
          files.map(file => ({
            ...file,
            uploadDate: new Date(file.uploadDate), // Convert string to Date
          }))
        )
      );
  }

  uploadFile(
    username: string,
    projectSlug: string,
    file: File
  ): Observable<ProjectFile> {
    // Get XSRF token from cookies
    const xsrfToken = document.cookie
      .split(';')
      .find(c => c.trim().startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

    if (!xsrfToken) {
      throw new Error('XSRF token not found in cookies');
    }

    return this.projectFilesService
      .projectFilesControllerUploadFile(username, projectSlug, xsrfToken, file)
      .pipe(
        map((response: FileUploadResponseDto) => ({
          ...response,
          uploadDate: new Date(response.uploadDate), // Convert string to Date
        }))
      );
  }

  deleteFile(
    username: string,
    projectSlug: string,
    storedName: string
  ): Observable<FileDeleteResponse> {
    // Get XSRF token from cookies
    const xsrfToken = document.cookie
      .split(';')
      .find(c => c.trim().startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

    if (!xsrfToken) {
      throw new Error('XSRF token not found in cookies');
    }

    return this.projectFilesService
      .projectFilesControllerDeleteFile(
        username,
        projectSlug,
        storedName,
        xsrfToken
      )
      .pipe(
        map(response => ({
          message: response.message || 'File deleted successfully',
        }))
      );
  }

  getFileUrl(
    username: string,
    projectSlug: string,
    storedName: string
  ): string {
    return (
      this.projectFilesService.configuration.basePath +
      `/api/v1/projects/${username}/${projectSlug}/files/${storedName}`
    );
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
