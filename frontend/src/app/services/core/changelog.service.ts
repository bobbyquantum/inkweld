import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { splitChangelog } from '@utils/release-notes';
import { marked } from 'marked';
import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * The changelog's URL, keyed to the running version. Releases up to
 * 1.0.0-beta.1 served `assets/CHANGELOG.md` as `immutable` for a year, so
 * browsers that opened it then keep that copy without asking the server; a
 * URL that changes with each release never hits that stale entry.
 */
export const CHANGELOG_URL = `assets/CHANGELOG.md?v=${encodeURIComponent(environment.version)}`;

export interface ChangelogVersion {
  version: string;
  date: string;
  content: string;
  isUnreleased: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ChangelogService {
  private readonly http = inject(HttpClient);

  getChangelog(): Observable<ChangelogVersion[]> {
    return this.http
      .get(CHANGELOG_URL, { responseType: 'text' })
      .pipe(map(text => this.parseChangelog(text)));
  }

  private parseChangelog(text: string): ChangelogVersion[] {
    return splitChangelog(text).map(({ version, date, markdown }) => ({
      version,
      date,
      content: marked.parse(markdown) as string,
      isUnreleased: version.toLowerCase() === 'unreleased',
    }));
  }
}
