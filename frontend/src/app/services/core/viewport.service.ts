import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  Injectable,
  OnDestroy,
  PLATFORM_ID,
  signal,
} from '@angular/core';

/**
 * ViewportService manages viewport-related state, particularly for handling
 * mobile virtual keyboards. It uses the Visual Viewport API to detect when
 * the keyboard is open and adjusts CSS custom properties accordingly.
 *
 * The problem: On iOS Safari and Android Chrome, the virtual keyboard overlays
 * content instead of resizing the viewport. CSS units like `dvh` don't reliably
 * update when the keyboard appears.
 *
 * The solution: Use `visualViewport.height` to get the actual visible area,
 * then set CSS custom properties that components can use for their heights.
 */
@Injectable({
  providedIn: 'root',
})
export class ViewportService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  /** The height of the actual visible viewport (excluding keyboard) */
  private readonly visualHeight = signal<number>(0);

  /** The full layout viewport height */
  private readonly layoutHeight = signal<number>(0);

  /** Whether the keyboard is currently open (visual height < layout height) */
  readonly isKeyboardOpen = computed(() => {
    const visual = this.visualHeight();
    const layout = this.layoutHeight();
    // Consider keyboard open if visual viewport is significantly smaller
    // Use a threshold to avoid false positives from browser chrome changes
    return layout > 0 && visual > 0 && layout - visual > 100;
  });

  /** The estimated keyboard height in pixels */
  readonly keyboardHeight = computed(() => {
    if (!this.isKeyboardOpen()) return 0;
    return this.layoutHeight() - this.visualHeight();
  });

  /** The actual visible viewport height (for CSS var injection) */
  readonly availableHeight = computed(() => this.visualHeight());

  private resizeHandler: (() => void) | null = null;
  private scrollHandler: (() => void) | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initialize();
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private initialize(): void {
    const visualViewport = window.visualViewport;

    if (visualViewport) {
      // Use Visual Viewport API (modern browsers)
      this.resizeHandler = () => this.updateFromVisualViewport();
      this.scrollHandler = () => this.updateFromVisualViewport();

      visualViewport.addEventListener('resize', this.resizeHandler);
      visualViewport.addEventListener('scroll', this.scrollHandler);

      // Initial update
      this.updateFromVisualViewport();
    } else {
      // Fallback for older browsers - just use window innerHeight
      this.resizeHandler = () => this.updateFromWindow();
      window.addEventListener('resize', this.resizeHandler);
      this.updateFromWindow();
    }

    // Also listen to regular window resize for layout height updates
    window.addEventListener('resize', () => {
      this.layoutHeight.set(window.innerHeight);
      this.updateCssVariables();
    });

    // Set initial layout height
    this.layoutHeight.set(window.innerHeight);
  }

  private updateFromVisualViewport(): void {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    this.visualHeight.set(visualViewport.height);
    this.layoutHeight.set(window.innerHeight);
    this.updateCssVariables();
  }

  private updateFromWindow(): void {
    const height = window.innerHeight;
    this.visualHeight.set(height);
    this.layoutHeight.set(height);
    this.updateCssVariables();
  }

  /**
   * Updates CSS custom properties on :root to reflect current viewport state.
   * Components can use these variables to adapt to keyboard visibility.
   */
  private updateCssVariables(): void {
    const root = document.documentElement;
    const height = this.visualHeight();

    // Set the actual visible height as a CSS variable
    root.style.setProperty('--visual-viewport-height', `${height}px`);

    // Calculate offset variants for common layout needs
    root.style.setProperty('--visual-viewport-height-48', `${height - 48}px`);
    root.style.setProperty('--visual-viewport-height-50', `${height - 50}px`);
    root.style.setProperty('--visual-viewport-height-82', `${height - 82}px`);
    root.style.setProperty('--visual-viewport-height-130', `${height - 130}px`);

    // Set a boolean-like property for CSS to check keyboard state
    root.style.setProperty(
      '--keyboard-open',
      this.isKeyboardOpen() ? '1' : '0'
    );
    root.style.setProperty('--keyboard-height', `${this.keyboardHeight()}px`);
  }

  private cleanup(): void {
    const visualViewport = window.visualViewport;

    if (visualViewport && this.resizeHandler) {
      visualViewport.removeEventListener('resize', this.resizeHandler);
    }
    if (visualViewport && this.scrollHandler) {
      visualViewport.removeEventListener('scroll', this.scrollHandler);
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
  }
}
