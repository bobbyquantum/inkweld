import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
  private http = inject(HttpClient);
  private apiUrl = '/api/v1/projects';

  getProjectFiles(
    username: string,
    projectSlug: string
  ): Observable<ProjectFile[]> {
    return this.http.get<ProjectFile[]>(
      `${this.apiUrl}/${username}/${projectSlug}/files`
    );
  }

  uploadFile(
    username: string,
    projectSlug: string,
    file: File
  ): Observable<ProjectFile> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ProjectFile>(
      `${this.apiUrl}/${username}/${projectSlug}/files`,
      formData
    );
  }

  deleteFile(
    username: string,
    projectSlug: string,
    storedName: string
  ): Observable<FileDeleteResponse> {
    return this.http.delete<FileDeleteResponse>(
      `${this.apiUrl}/${username}/${projectSlug}/files/${storedName}`
    );
  }

  getFileUrl(
    username: string,
    projectSlug: string,
    storedName: string
  ): string {
    return `${this.apiUrl}/${username}/${projectSlug}/files/${storedName}`;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
