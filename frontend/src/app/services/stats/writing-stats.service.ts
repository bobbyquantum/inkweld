import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ProjectStatsResponse,
  UserStatsResponse,
} from '@models/writing-stats';
import { SetupService } from '@services/core/setup.service';
import type { Observable } from 'rxjs';

/**
 * Reads server-side writing statistics aggregated from Yjs WS sessions.
 *
 * Online-only: there is no offline cache for stats — calls fail fast when
 * the backend is unreachable, matching the pattern used by `AdminEmailService`.
 *
 * Endpoints (see `backend/src/routes/stats.routes.ts`):
 * - `GET /api/v1/stats/projects/:username/:slug?days=N`
 * - `GET /api/v1/stats/me?days=N`
 */
@Injectable({
  providedIn: 'root',
})
export class WritingStatsService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  private get baseUrl(): string {
    return `${this.basePath}/api/v1/stats`;
  }

  /**
   * Stats for a single project: totals, daily series, and per-contributor totals.
   * `days` is clamped server-side to 1–365; default 30.
   */
  getProjectStats(
    username: string,
    slug: string,
    days = 30
  ): Observable<ProjectStatsResponse> {
    const url = `${this.baseUrl}/projects/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
    return this.http.get<ProjectStatsResponse>(url, {
      params: { days: String(days) },
      withCredentials: true,
    });
  }

  /**
   * Cross-project stats for the signed-in user.
   * `days` is clamped server-side to 1–365; default 30.
   */
  getMyStats(days = 30): Observable<UserStatsResponse> {
    return this.http.get<UserStatsResponse>(`${this.baseUrl}/me`, {
      params: { days: String(days) },
      withCredentials: true,
    });
  }
}
