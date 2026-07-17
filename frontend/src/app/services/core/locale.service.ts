import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

const STORAGE_KEY = 'inkweld-lang';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly transloco = inject(TranslocoService);

  get availableLangs() {
    return this.transloco.config.availableLangs;
  }

  get currentLang() {
    return this.transloco.getActiveLang();
  }

  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && this.isLangAvailable(saved)) {
      this.transloco.setActiveLang(saved);
    }
  }

  setLang(lang: string) {
    if (!this.isLangAvailable(lang)) {
      return;
    }
    this.transloco.setActiveLang(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }

  private isLangAvailable(lang: string): boolean {
    const langs = this.transloco.config.availableLangs;
    return langs.some(
      (l: string | { id: string; label: string }) =>
        (typeof l === 'string' ? l : l.id) === lang
    );
  }
}
