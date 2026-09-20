import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';

/**
 * Response shape for the bulk-sync manifest.
 *
 * NOTE: Declared locally rather than in the generated api-client because
 * regenerating that client requires a Java runtime which is not available
 * everywhere (the same reason `SystemConfigService` declares `BrandingLinks`
 * locally). If the generated model ever gains these types, this can be deleted.
 */
export interface DocumentRevisionEntry {
  documentId: string;
  revision: string | null;
  unknown?: boolean;
}

export interface DocumentSyncManifest {
  documents: DocumentRevisionEntry[];
}

/**
 * Reads the server's per-document revision manifest for a project.
 *
 * Written by hand (rather than via the generated client) so the feature does
 * not block on an OpenAPI/Angular-client regeneration. The auth interceptor
 * attaches the Bearer token automatically; `withCredentials` mirrors the other
 * hand-written services.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentSyncManifestService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);
  private readonly logger = inject(LoggerService);

  private get baseUrl(): string {
    return `${this.setupService.getServerUrl() ?? ''}/api/v1/projects`;
  }

  /**
   * Fetch the revision manifest. Returns `null` when it cannot be retrieved
   * (offline, older server, transient error) so callers fall back to syncing
   * every document rather than skipping any.
   */
  async getManifest(
    username: string,
    slug: string
  ): Promise<DocumentSyncManifest | null> {
    try {
      return await firstValueFrom(
        this.http.get<DocumentSyncManifest>(
          `${this.baseUrl}/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/docs/sync-manifest`,
          { withCredentials: true }
        )
      );
    } catch (error) {
      this.logger.warn(
        'DocumentSyncManifestService',
        `Could not fetch sync manifest for ${username}/${slug}; syncing all documents`,
        error
      );
      return null;
    }
  }
}
