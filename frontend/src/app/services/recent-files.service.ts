import { inject, Injectable, signal } from '@angular/core';
import { ProjectElementDto } from '@worm/index';

import { SettingsService } from './settings.service';

interface RecentFile {
  id: string;
  name: string;
  type: string;
  timestamp: number;
  projectUser: string;
  projectSlug: string;
}

@Injectable({
  providedIn: 'root',
})
export class RecentFilesService {
  readonly recentFiles = signal<RecentFile[]>([]);

  private readonly MAX_RECENT_FILES = 10;
  private readonly STORAGE_KEY = 'recentFiles';

  private readonly settingsService = inject(SettingsService);

  constructor() {
    this.loadRecentFiles();
  }

  addRecentFile(file: ProjectElementDto, username: string, slug: string): void {
    const currentFiles = [...this.recentFiles()];

    // Remove the file if it already exists
    const filteredFiles = currentFiles.filter(f => f.id !== file.id);

    // Create a new recent file entry
    const recentFile: RecentFile = {
      id: file.id,
      name: file.name,
      type: file.type,
      timestamp: Date.now(),
      projectUser: username,
      projectSlug: slug,
    };

    // Add the file to the beginning of the array
    const newFiles = [recentFile, ...filteredFiles].slice(
      0,
      this.MAX_RECENT_FILES
    );

    // Update the signal and save to storage
    this.recentFiles.set(newFiles);
    this.saveRecentFiles();
    console.log('Recent files after adding:', this.recentFiles());
  }

  getRecentFilesForProject(username: string, slug: string): RecentFile[] {
    console.log(
      'Getting recent files for project:',
      username,
      slug,
      'All recent files:',
      this.recentFiles()
    );
    const filteredFiles = this.recentFiles().filter(
      file => file.projectUser === username && file.projectSlug === slug
    );
    console.log('Filtered recent files:', filteredFiles);
    return filteredFiles;
  }

  clearRecentFiles(): void {
    this.recentFiles.set([]);
    this.saveRecentFiles();
  }

  private loadRecentFiles(): void {
    const files = this.settingsService.getSetting<RecentFile[]>(
      this.STORAGE_KEY,
      []
    );
    console.log('Loaded recent files from storage:', files);
    this.recentFiles.set(files);
  }

  private saveRecentFiles(): void {
    console.log('Saving recent files to storage:', this.recentFiles());
    this.settingsService.setSetting(this.STORAGE_KEY, this.recentFiles());
  }
}
