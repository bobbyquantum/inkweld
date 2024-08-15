import { Injectable, Renderer2, RendererFactory2, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private renderer: Renderer2;
  private colorTheme = new BehaviorSubject<'light-theme' | 'dark-theme'>(
    'dark-theme'
  );

  constructor(
    rendererFactory: RendererFactory2,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  initTheme() {
    this.getColorTheme();
    this.renderer.addClass(this.document.body, this.colorTheme.value);
  }

  update(theme: 'light-theme' | 'dark-theme') {
    this.setColorTheme(theme);
    const previousColorTheme =
      theme === 'dark-theme' ? 'light-theme' : 'dark-theme';
    this.renderer.removeClass(this.document.body, previousColorTheme);
    this.renderer.addClass(this.document.body, theme);
  }

  isDarkMode() {
    return this.colorTheme.value === 'dark-theme';
  }

  private setColorTheme(theme: 'light-theme' | 'dark-theme') {
    this.colorTheme.next(theme);
    localStorage.setItem('user-theme', theme);
  }

  private getColorTheme() {
    const theme = localStorage.getItem('user-theme');
    if (theme) {
      this.colorTheme.next(theme as 'light-theme' | 'dark-theme');
    } else {
      this.colorTheme.next('dark-theme');
    }
  }
}
