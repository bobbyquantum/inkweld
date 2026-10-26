import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { splitChangelog } from '@utils/release-notes';
import { marked } from 'marked';
import { map, type Observable } from 'rxjs';

import { commitScopeIcon } from './commit-scopes';

export interface ChangelogVersion {
  version: string;
  date: string;
  content: string;
  isUnreleased: boolean;
}

/**
 * A release-please entry with a scope, `* **editor:** …`, as marked renders
 * it (a loose list wraps the item in `<p>`).
 */
const SCOPED_ITEM = /(<li>(?:<p>)?)<strong>([\da-z-]+):<\/strong>/g;

/** Put each approved scope's icon in front of its changelog entries. */
function addScopeIcons(html: string): string {
  return html.replaceAll(
    SCOPED_ITEM,
    (item: string, start: string, scope: string) => {
      const icon = commitScopeIcon(scope);
      if (!icon) return item;
      return `${start}<span class="material-symbols-outlined changelog-scope-icon" aria-hidden="true">${icon}</span><strong>${scope}:</strong>`;
    }
  );
}

@Injectable({
  providedIn: 'root',
})
export class ChangelogService {
  private readonly http = inject(HttpClient);

  getChangelog(): Observable<ChangelogVersion[]> {
    return this.http
      .get('assets/CHANGELOG.md', { responseType: 'text' })
      .pipe(map(text => this.parseChangelog(text)));
  }

  private parseChangelog(text: string): ChangelogVersion[] {
    return splitChangelog(text).map(({ version, date, markdown }) => ({
      version,
      date,
      content: addScopeIcons(marked.parse(markdown) as string),
      isUnreleased: version.toLowerCase() === 'unreleased',
    }));
  }
}
