import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
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
 * Version headings (the text after `## `) the changelog may contain:
 * - Keep a Changelog: `[1.0.0] - 2025-01-01` or `[Unreleased]`
 * - release-please: `[1.0.1](https://…/compare/v1.0.0...v1.0.1) (2026-10-10)`
 * - release-please without a previous tag: `1.0.1 (2026-10-10)`
 */
const VERSION_HEADER_PATTERNS = [
  /^\[([^\]]+)\](?: - (.+))?$/,
  /^\[([^\]]+)\]\([^)\s]*\)(?: \(([^)]+)\))?$/,
  /^(\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?)(?: \(([^)]+)\))?$/,
];

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

function parseVersionHeader(
  header: string
): { version: string; date: string } | null {
  for (const pattern of VERSION_HEADER_PATTERNS) {
    const match = pattern.exec(header);
    if (match) {
      return { version: match[1], date: match[2] ?? '' };
    }
  }
  return null;
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
    const versions: ChangelogVersion[] = [];
    // Split by ## but keep the delimiter or just split and handle
    const sections = text.split(/^## /m);

    // Skip the first section (header before the first ##)
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const lines = section.split('\n');
      const header = lines[0].trim();
      // Remove trailing horizontal rules and whitespace
      const content = lines
        .slice(1)
        .join('\n')
        .replace(/---\s*$/, '')
        .trim();

      const parsed = parseVersionHeader(header);

      if (parsed) {
        const { version, date } = parsed;
        const isUnreleased = version.toLowerCase() === 'unreleased';

        versions.push({
          version,
          date,
          content: addScopeIcons(marked.parse(content) as string),
          isUnreleased,
        });
      }
    }

    return versions;
  }
}
