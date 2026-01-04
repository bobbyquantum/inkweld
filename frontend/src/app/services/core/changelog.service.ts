import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { marked } from 'marked';
import { map, Observable } from 'rxjs';

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
  private http = inject(HttpClient);

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

      // Match [version] - date or [Unreleased]
      const versionMatch = header.match(/\[(.*?)\](?: - (.*))?/);

      if (versionMatch) {
        const version = versionMatch[1];
        const date = versionMatch[2] || '';
        const isUnreleased = version.toLowerCase() === 'unreleased';

        versions.push({
          version,
          date,
          content: marked.parse(content) as string,
          isUnreleased,
        });
      }
    }

    return versions;
  }
}
