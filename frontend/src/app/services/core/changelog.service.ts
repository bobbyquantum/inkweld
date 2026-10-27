import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { splitChangelog } from '@utils/release-notes';
import { marked } from 'marked';
import { map, type Observable } from 'rxjs';

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
      .get('assets/CHANGELOG.md', { responseType: 'text' })
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
