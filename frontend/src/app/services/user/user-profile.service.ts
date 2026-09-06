import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
import type { ProfileBackground } from '@inkweld/model/profile-background';
import type { UserProfile } from '@inkweld/model/user-profile';
import { SetupService } from '@services/core/setup.service';
import type { Observable } from 'rxjs';

/**
 * Reads another user's public profile and their yearly writing activity, and
 * lets the signed-in user dress their own profile page.
 *
 * Online-only, like `WritingStatsService`: there is no offline cache and
 * calls fail fast when the backend is unreachable. The read endpoints accept
 * anonymous callers; the server decides what the caller may see.
 *
 * Endpoints (see `backend/src/routes/profile.routes.ts`):
 * - `GET /api/v1/users/:username/profile`
 * - `GET /api/v1/users/:username/activity?year=YYYY&tz=Area/City`
 * - `GET /api/v1/users/:username/banner`
 * - `PUT /api/v1/users/me/profile-background`
 * - `POST` / `DELETE /api/v1/users/me/banner`
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

  /**
   * URL of a user's banner. `version` is a cache-buster: the path is stable
   * across uploads, so a fresh upload needs a nudge before a cached copy is
   * re-fetched.
   */
  bannerUrl(username: string, version = 0): string {
    const base = `${this.baseUrl}/${encodeURIComponent(username)}/banner`;
    return version > 0 ? `${base}?v=${version}` : base;
  }

  /**
   * Fetch a user's banner as a blob.
   *
   * Fetched rather than pointed at from an `<img src>` for the same reason
   * avatars are: the API's `Cross-Origin-Resource-Policy: same-origin` header
   * makes browsers refuse to embed it when the frontend is served from another
   * origin (the dev server, a separately hosted frontend), whereas a CORS
   * request with credentials goes through — and carries the session the
   * visibility check needs.
   */
  getBanner(username: string, version = 0): Observable<Blob> {
    return this.http.get(this.bannerUrl(username, version), {
      responseType: 'blob',
      withCredentials: true,
    });
  }

  /** Choose the backdrop of the caller's own profile page. */
  setProfileBackground(
    background: ProfileBackground
  ): Observable<ProfileBackground> {
    return this.http.put<ProfileBackground>(
      `${this.baseUrl}/me/profile-background`,
      background,
      { withCredentials: true }
    );
  }

  /** Upload (or replace) the caller's profile banner. */
  uploadBanner(file: Blob, filename: string): Observable<unknown> {
    const form = new FormData();
    form.append('banner', file, filename);
    return this.http.post(`${this.baseUrl}/me/banner`, form, {
      withCredentials: true,
    });
  }

  /** Remove the caller's profile banner. */
  deleteBanner(): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/me/banner`, {
      withCredentials: true,
    });
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
