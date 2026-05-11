import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  ProjectActivityResponse,
  UserActivityResponse,
} from '@models/activity-event';
import { SetupService } from '@services/core/setup.service';

/**
 * Reads the append-only activity feed.
 *
 * Online-only — no offline cache. Pagination uses a `before=<unixMs>`
 * cursor returned as `nextBefore` in each response.
 *
 * Endpoints (see `backend/src/routes/activity.routes.ts`):
 * - `GET /api/v1/activity/projects/:username/:slug?limit=N&before=MS`
 * - `GET /api/v1/activity/me?limit=N&before=MS`
 */
@Injectable({
  providedIn: 'root',
})
export class ActivityFeedService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  private get baseUrl(): string {
    return `${this.basePath}/api/v1/activity`;
  }

  /**
   * Activity events for a single project, newest-first.
   * @param limit Page size (default 50, server-capped at 100).
   * @param before Unix-ms cursor; pass the previous page's `nextBefore` to paginate.
   */
  getProjectActivity(
    username: string,
    slug: string,
    options: { limit?: number; before?: number } = {}
  ): Observable<ProjectActivityResponse> {
    const url = `${this.baseUrl}/projects/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
    const params: Record<string, string> = {};
    if (options.limit !== undefined) params['limit'] = String(options.limit);
    if (options.before !== undefined) params['before'] = String(options.before);
    return this.http.get<ProjectActivityResponse>(url, {
      params,
      withCredentials: true,
    });
  }

  /**
   * Cross-project activity for the signed-in user (own + collaborated projects).
   * @param limit Page size (default 50, server-capped at 100).
   * @param before Unix-ms cursor; pass the previous page's `nextBefore` to paginate.
   */
  getMyActivity(
    options: { limit?: number; before?: number } = {}
  ): Observable<UserActivityResponse> {
    const params: Record<string, string> = {};
    if (options.limit !== undefined) params['limit'] = String(options.limit);
    if (options.before !== undefined) params['before'] = String(options.before);
    return this.http.get<UserActivityResponse>(`${this.baseUrl}/me`, {
      params,
      withCredentials: true,
    });
  }
}
