import { Injectable, Renderer2, RendererFactory2, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeOption = 'light-theme' | 'dark-theme' | 'system';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private renderer: Renderer2;
  private colorTheme = new BehaviorSubject<ThemeOption>('system');
  private systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

  constructor(
    rendererFactory: RendererFactory2,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.systemDarkMode.addListener(this.systemThemeChanged.bind(this));
  }

  initTheme() {
    this.getColorTheme();
    this.updateBodyClass();
  }

  update(theme: ThemeOption) {
    this.setColorTheme(theme);
    this.updateBodyClass();
  }

  isDarkMode(): boolean {
    if (this.colorTheme.value === 'system') {
      return this.systemDarkMode.matches;
    }
    return this.colorTheme.value === 'dark-theme';
  }

  getCurrentTheme(): Observable<ThemeOption> {
    return this.colorTheme.asObservable();
  }

  private setColorTheme(theme: ThemeOption) {
    this.colorTheme.next(theme);
    localStorage.setItem('user-theme', theme);
  }

  private getColorTheme() {
    const theme = localStorage.getItem('user-theme') as ThemeOption;
    if (theme) {
      this.colorTheme.next(theme);
    } else {
      this.colorTheme.next('system');
    }
  }

  private updateBodyClass() {
    const theme = this.isDarkMode() ? 'dark-theme' : 'light-theme';
    this.renderer.removeClass(this.document.body, 'light-theme');
    this.renderer.removeClass(this.document.body, 'dark-theme');
    this.renderer.addClass(this.document.body, theme);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private systemThemeChanged(_event: MediaQueryListEvent) {
    if (this.colorTheme.value === 'system') {
      this.updateBodyClass();
    }
  }
}
