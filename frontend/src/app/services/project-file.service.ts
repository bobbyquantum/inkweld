import { inject, Injectable } from '@angular/core';
import {
  FileDeleteResponseDto,
  FileMetadataDto,
  FileUploadResponseDto,
} from '@inkweld/index';
import { catchError, map, Observable, throwError } from 'rxjs';

import { ProjectAPIService } from '../../api-client/api/project-api.service';
import { XsrfService } from './xsrf.service';

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
  private projectApi = inject(ProjectAPIService);
  private xsrfService = inject(XsrfService);

  getProjectFiles(
    username: string,
    projectSlug: string
  ): Observable<ProjectFile[]> {
    try {
      return this.projectApi
        .projectFilesControllerListFiles(username, projectSlug)
        .pipe(
          map((files: FileMetadataDto[]) =>
            files.map(file => ({
              ...file,
              uploadDate: new Date(file.uploadDate), // Convert string to Date
            }))
          ),
          catchError((error: unknown) => {
            console.error('Error fetching project files:', error);
            return throwError(
              () =>
                new Error(
                  `Failed to fetch project files: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }`
                )
            );
          })
        );
    } catch (error: unknown) {
      console.error('Error in getProjectFiles:', error);
      return throwError(
        () =>
          new Error(
            `Failed to fetch project files: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
      );
    }
  }

  uploadFile(
    username: string,
    projectSlug: string,
    file: File
  ): Observable<ProjectFile> {
    try {
      const xsrfToken = this.xsrfService.getXsrfToken();
      return this.projectApi
        .projectFilesControllerUploadFile(
          username,
          projectSlug,
          xsrfToken,
          file
        )
        .pipe(
          map((response: FileUploadResponseDto) => ({
            ...response,
            uploadDate: new Date(response.uploadDate), // Convert string to Date
          })),
          catchError((error: unknown) => {
            console.error('Error uploading file:', error);
            return throwError(
              () =>
                new Error(
                  `Failed to upload file: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }`
                )
            );
          })
        );
    } catch (error: unknown) {
      console.error('Error in uploadFile:', error);
      return throwError(
        () =>
          new Error(
            `Failed to upload file: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
      );
    }
  }

  deleteFile(
    username: string,
    projectSlug: string,
    storedName: string
  ): Observable<FileDeleteResponse> {
    try {
      const xsrfToken = this.xsrfService.getXsrfToken();
      return this.projectApi
        .projectFilesControllerDeleteFile(
          username,
          projectSlug,
          storedName,
          xsrfToken
        )
        .pipe(
          map((response: FileDeleteResponseDto) => ({
            message: response.message || 'File deleted successfully',
          })),
          catchError((error: unknown) => {
            console.error('Error deleting file:', error);
            return throwError(
              () =>
                new Error(
                  `Failed to delete file: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }`
                )
            );
          })
        );
    } catch (error: unknown) {
      console.error('Error in deleteFile:', error);
      return throwError(
        () =>
          new Error(
            `Failed to delete file: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
      );
    }
  }

  getFileUrl(
    username: string,
    projectSlug: string,
    storedName: string
  ): string {
    return (
      this.projectApi.configuration.basePath +
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
