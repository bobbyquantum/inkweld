import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { forkJoin, map, type Observable } from 'rxjs';

const SCOPES = ['app', 'login', 'home', 'settings'] as const;

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    const common$ = this.http.get<Translation>(
      `/assets/i18n/${lang}/common.json`
    );
    const scopeRequests = SCOPES.map(scope =>
      this.http
        .get<Translation>(`/assets/i18n/${lang}/${scope}.json`)
        .pipe(map(t => [scope, t] as const))
    );

    return forkJoin([common$, ...scopeRequests]).pipe(
      map(([common, ...scopes]) => {
        const merged: Translation = { ...common };
        for (const [scope, translations] of scopes) {
          merged[scope] = translations;
        }
        return merged;
      })
    );
  }
}
