import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { type Project } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { LocalStorageService } from '../local/local-storage.service';
import { MediaSyncService } from '../local/media-sync.service';

/** Maximum number of concurrent cover downloads */
const MAX_CONCURRENCY = 3;

/**
 * Service that automatically syncs project cover images to IndexedDB.
 *
 * Designed to run on the home screen after projects load. It compares
 * each project's `coverImage` ref against the local cache and only
 * downloads covers that are missing or have changed.
 *
 * Cover filenames include a timestamp (e.g., `cover-1711638400000.jpg`),
 * so a changed cover produces a different mediaId, making change detection
 * a simple local cache lookup.
 *
 * @example
 * ```typescript
 * // Fire-and-forget after loading projects
 * void coverSyncService.syncCovers(projects);
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class CoverSyncService {
  private readonly http = inject(HttpClient);
  private readonly localStorage = inject(LocalStorageService);
  private readonly mediaSyncService = inject(MediaSyncService);
  private readonly setupService = inject(SetupService);
  private readonly logger = inject(LoggerService);

  /** Whether a cover sync is currently running */
  readonly isSyncing = signal(false);

  /**
   * Sync cover images for a list of projects.
   *
   * Checks IndexedDB for each project's cover media ref. Only downloads
   * covers that are not already cached. Runs concurrently with a limit
   * to avoid saturating browser connections.
   *
   * This method is fire-and-forget: it never throws and logs errors internally.
   */
  async syncCovers(projects: Project[]): Promise<void> {
    if (this.isSyncing()) {
      this.logger.debug('CoverSync', 'Skipping — already syncing');
      return;
    }

    if (this.setupService.getMode() === 'local') {
      this.logger.debug('CoverSync', 'Skipping — local mode');
      return;
    }

    if (!navigator.onLine) {
      this.logger.debug('CoverSync', 'Skipping — offline');
      return;
    }

    this.isSyncing.set(true);

    try {
      const needsDownload = await this.findUncachedCovers(projects);

      if (needsDownload.length === 0) {
        this.logger.debug('CoverSync', 'All covers are cached');
        return;
      }

      this.logger.info(
        'CoverSync',
        `Downloading ${needsDownload.length} cover(s)`
      );

      const downloaded = await this.downloadCovers(needsDownload);

      if (downloaded > 0) {
        this.mediaSyncService.mediaSyncVersion.update(v => v + 1);
        this.logger.info('CoverSync', `Synced ${downloaded} cover(s)`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('CoverSync', `Unexpected error: ${message}`);
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * Filter projects to those whose cover is not in IndexedDB.
   */
  private async findUncachedCovers(
    projects: Project[]
  ): Promise<CoverDownloadTask[]> {
    const tasks: CoverDownloadTask[] = [];

    for (const project of projects) {
      if (!project.coverImage) {
        continue;
      }

      const projectKey = `${project.username}/${project.slug}`;
      const mediaId = this.filenameToMediaId(project.coverImage);

      const hasCached = await this.localStorage.hasMedia(projectKey, mediaId);
      if (hasCached) {
        continue;
      }

      tasks.push({
        projectKey,
        username: project.username,
        slug: project.slug,
        filename: project.coverImage,
        mediaId,
      });
    }

    return tasks;
  }

  /**
   * Download covers with a concurrency limit.
   * Returns the number of successfully downloaded covers.
   */
  private async downloadCovers(tasks: CoverDownloadTask[]): Promise<number> {
    let downloaded = 0;
    let index = 0;

    const runNext = async (): Promise<void> => {
      while (index < tasks.length) {
        const task = tasks[index++];
        try {
          await this.downloadCover(task);
          downloaded++;
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            'CoverSync',
            `Failed to download cover for ${task.projectKey}: ${message}`
          );
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENCY, tasks.length) },
      () => runNext()
    );
    await Promise.all(workers);

    return downloaded;
  }

  /**
   * Download a single cover and save it to IndexedDB.
   */
  private async downloadCover(task: CoverDownloadTask): Promise<void> {
    const url = `${environment.apiUrl}/api/v1/media/${task.username}/${task.slug}/${task.filename}`;

    const blob = await firstValueFrom(
      this.http.get(url, { responseType: 'blob' })
    );

    await this.localStorage.saveMedia(
      task.projectKey,
      task.mediaId,
      blob,
      task.filename
    );
  }

  /**
   * Strip file extension to produce a mediaId.
   * e.g., "cover-1711638400000.jpg" → "cover-1711638400000"
   */
  private filenameToMediaId(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(0, lastDot) : filename;
  }
}

/**
 * Internal type representing a cover that needs downloading.
 */
interface CoverDownloadTask {
  projectKey: string;
  username: string;
  slug: string;
  filename: string;
  mediaId: string;
}
