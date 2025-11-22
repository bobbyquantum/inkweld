import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { MessageResponse, ProjectFile as ApiProjectFile } from '@inkweld/index';
import { catchError, map, Observable, throwError } from 'rxjs';

import { FilesService } from '../../api-client/api/files.service';
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
  private filesApi = inject(FilesService);
  private http = inject(HttpClient);
  private xsrfService = inject(XsrfService);

  getProjectFiles(
    username: string,
    projectSlug: string
  ): Observable<ProjectFile[]> {
    try {
      return this.filesApi.listProjectFiles(username, projectSlug).pipe(
        map((files: ApiProjectFile[]) =>
          files.map(file => ({
            originalName: file.name,
            storedName: file.name, // API doesn't distinguish, use same name
            contentType: '', // Not provided by API
            size: file.size ?? 0, // Default to 0 if not provided
            uploadDate: file.uploadDate
              ? new Date(file.uploadDate)
              : new Date(), // Default to now if not provided
            fileUrl: this.getFileUrl(username, projectSlug, file.name), // Add fileUrl using name
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
      const formData = new FormData();
      formData.append('file', file);

      const url = `${this.filesApi.configuration.basePath}/api/v1/projects/${username}/${projectSlug}/files`;
      return this.http
        .post<ApiProjectFile>(url, formData, { withCredentials: true })
        .pipe(
          map((response: ApiProjectFile) => ({
            originalName: response.name,
            storedName: response.name,
            contentType: '',
            size: response.size ?? 0, // Default to 0 if not provided
            uploadDate: response.uploadDate
              ? new Date(response.uploadDate)
              : new Date(), // Default to now
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
      return this.filesApi
        .deleteProjectFile(username, projectSlug, storedName)
        .pipe(
          map((response: MessageResponse) => ({
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
      this.filesApi.configuration.basePath +
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
