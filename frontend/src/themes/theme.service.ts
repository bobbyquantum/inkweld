import {
  DOCUMENT,
  inject,
  Injectable,
  OnDestroy,
  Renderer2,
  RendererFactory2,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeOption = 'light-theme' | 'dark-theme' | 'system';

@Injectable({
  providedIn: 'root',
})
export class ThemeService implements OnDestroy {
  private renderer: Renderer2;
  private colorTheme = new BehaviorSubject<ThemeOption>('system');
  private systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

  private document = inject(DOCUMENT);
  private rendererFactory = inject(RendererFactory2);
  private matIconRegistry = inject(MatIconRegistry);
  private domSanitizer = inject(DomSanitizer);

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);
    this.systemDarkMode.addEventListener(
      'change',
      this.systemThemeChanged.bind(this)
    );
  }

  ngOnDestroy() {
    this.systemDarkMode.removeEventListener(
      'change',
      this.systemThemeChanged.bind(this)
    );
  }

  initTheme() {
    this.getColorTheme();
    this.updateBodyClass();
    this.registerCustomIcons();
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
    const theme = (localStorage.getItem('user-theme') ??
      'system') as ThemeOption;
    this.colorTheme.next(theme);
  }

  private updateBodyClass() {
    const theme = this.isDarkMode() ? 'dark-theme' : 'light-theme';
    this.renderer.removeClass(this.document.body, 'light-theme');
    this.renderer.removeClass(this.document.body, 'dark-theme');
    this.renderer.addClass(this.document.body, theme);
  }

  private systemThemeChanged() {
    if (this.colorTheme.value === 'system') {
      this.updateBodyClass();
    }
  }

  private registerCustomIcons() {
    this.matIconRegistry.addSvgIconLiteral(
      'google',
      this.domSanitizer.bypassSecurityTrustHtml(`
        <svg viewBox="0 0 24 24">
          <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/>
        </svg>
      `)
    );

    this.matIconRegistry.addSvgIconLiteral(
      'facebook',
      this.domSanitizer.bypassSecurityTrustHtml(`
        <svg viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      `)
    );

    this.matIconRegistry.addSvgIconLiteral(
      'github',
      this.domSanitizer.bypassSecurityTrustHtml(`
        <svg viewBox="0 0 24 24">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
        </svg>
      `)
    );

    this.matIconRegistry.addSvgIconLiteral(
      'openrouter',
      this.domSanitizer.bypassSecurityTrustHtml(`
        <svg viewBox="0 0 512 512" fill="currentColor" stroke="currentColor">
          <g clip-path="url(#clip0_205_3)">
            <path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" stroke-width="90" fill="none"/>
            <path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z"/>
            <path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" stroke-width="90" fill="none"/>
            <path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z"/>
          </g>
        </svg>
      `)
    );

    this.matIconRegistry.addSvgIconLiteral(
      'falai',
      this.domSanitizer.bypassSecurityTrustHtml(`
        <svg viewBox="0 0 170 171" fill="currentColor">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M109.571 0.690002C112.515 0.690002 114.874 3.08348 115.155 6.01352C117.665 32.149 138.466 52.948 164.603 55.458C167.534 55.7394 169.927 58.0985 169.927 61.042V110.255C169.927 113.198 167.534 115.557 164.603 115.839C138.466 118.349 117.665 139.148 115.155 165.283C114.874 168.213 112.515 170.607 109.571 170.607H60.3553C57.4116 170.607 55.0524 168.213 54.7709 165.283C52.2608 139.148 31.4601 118.349 5.32289 115.839C2.39266 115.557 -0.000976562 113.198 -0.000976562 110.255V61.042C-0.000976562 58.0985 2.39267 55.7394 5.3229 55.458C31.4601 52.948 52.2608 32.149 54.7709 6.01351C55.0524 3.08348 57.4116 0.690002 60.3553 0.690002H109.571ZM34.1182 85.5045C34.1182 113.776 57.0124 136.694 85.2539 136.694C113.495 136.694 136.39 113.776 136.39 85.5045C136.39 57.2332 113.495 34.3147 85.2539 34.3147C57.0124 34.3147 34.1182 57.2332 34.1182 85.5045Z"/>
        </svg>
      `)
    );
  }
}
