import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
import type { UserProfile } from '@inkweld/model/user-profile';
import { SetupService } from '@services/core/setup.service';
import type { Observable } from 'rxjs';

/**
 * Reads another user's public profile and their yearly writing activity.
 *
 * Online-only, like `WritingStatsService`: there is no offline cache and
 * calls fail fast when the backend is unreachable. Both endpoints accept
 * anonymous callers; the server decides what the caller may see.
 *
 * Endpoints (see `backend/src/routes/profile.routes.ts`):
 * - `GET /api/v1/users/:username/profile`
 * - `GET /api/v1/users/:username/activity?year=YYYY&tz=Area/City`
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  private get baseUrl(): string {
    return `${this.setupService.getServerUrl() ?? ''}/api/v1/users`;
  }

  getProfile(username: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(
      `${this.baseUrl}/${encodeURIComponent(username)}/profile`,
      { withCredentials: true }
    );
  }

  /**
   * One calendar year of per-day word counts. Days are bucketed in the
   * browser's timezone so late-night sessions land on the writer's day.
   */
  getActivity(
    username: string,
    year?: number,
    timeZone = UserProfileService.browserTimeZone()
  ): Observable<ProfileActivityYear> {
    const params: Record<string, string> = {};
    if (year !== undefined) params['year'] = String(year);
    if (timeZone) params['tz'] = timeZone;
    return this.http.get<ProfileActivityYear>(
      `${this.baseUrl}/${encodeURIComponent(username)}/activity`,
      { params, withCredentials: true }
    );
  }

  /** IANA zone of the current browser, or undefined when unavailable. */
  static browserTimeZone(): string | undefined {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      return undefined;
    }
  }
}
