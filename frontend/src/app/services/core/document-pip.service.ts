import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentPortal, DomPortalOutlet } from '@angular/cdk/portal';
import {
  ApplicationRef,
  type ComponentRef,
  EnvironmentInjector,
  inject,
  Injectable,
  Injector,
  runInInjectionContext,
  signal,
  type Type,
} from '@angular/core';

import { LoggerService } from './logger.service';

/** Opening size of a picture-in-picture document window, in CSS pixels. */
const PIP_WIDTH = 900;
const PIP_HEIGHT = 1000;

/**
 * The slice of the Document Picture-in-Picture API this service uses.
 * TypeScript's DOM library does not describe it yet.
 */
interface DocumentPictureInPicture {
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }): Promise<Window>;
  readonly window: Window | null;
}

/**
 * Pulls in the document editor on demand. Dynamic so the editor stays out of
 * any bundle that merely references this service.
 */
async function loadDocumentEditor(): Promise<Type<unknown>> {
  const { DocumentElementEditorComponent } =
    await import('../../components/document-element-editor/document-element-editor.component');
  return DocumentElementEditorComponent;
}

/** The API object, or null where the browser does not implement it. */
function pictureInPictureApi(): DocumentPictureInPicture | null {
  const api = (
    globalThis as unknown as {
      documentPictureInPicture?: DocumentPictureInPicture;
    }
  ).documentPictureInPicture;
  return api ?? null;
}

/**
 * Routes Angular Material overlays — the editor's toolbar menus, tooltips and
 * dialogs — into the picture-in-picture document.
 *
 * Without this they attach to the main window's body, so clicking a dropdown
 * in the popped-out editor would open the menu in the window behind it.
 */
@Injectable()
class PictureInPictureOverlayContainer extends OverlayContainer {
  private pipContainer?: HTMLElement;
  private pipDocument!: Document;

  /**
   * Points this container at the picture-in-picture document. Separate from
   * construction because the class is built by hand, not by the injector.
   */
  useDocument(pipDocument: Document): void {
    this.pipDocument = pipDocument;
  }

  override getContainerElement(): HTMLElement {
    this.pipContainer ??= this.createPipContainer();
    return this.pipContainer;
  }

  override ngOnDestroy(): void {
    this.pipContainer?.remove();
    this.pipContainer = undefined;
    super.ngOnDestroy();
  }

  private createPipContainer(): HTMLElement {
    const element = this.pipDocument.createElement('div');
    element.classList.add('cdk-overlay-container');
    this.pipDocument.body.append(element);
    return element;
  }
}

/**
 * Shows a document in a Document Picture-in-Picture window, where the browser
 * supports one (Chrome and Edge at the time of writing).
 *
 * This is the better pop-out when it is available. A picture-in-picture window
 * shares the page's JavaScript context, so the editor it hosts is the same
 * component instance talking to the same Yjs document as the main window — no
 * second copy of the app, no cross-window sync, and it opens instantly. It is
 * also always-on-top, which suits keeping a scene in view while working
 * elsewhere.
 *
 * Its limits are the reason {@link PopoutService}'s plain window stays: only
 * one such window can exist per tab, and it closes when the tab does.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentPipService {
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly logger = inject(LoggerService);

  /**
   * @internal Loads the editor on demand, and is writable so tests can stand a
   * stub in its place — esbuild inlines local modules, so vi.mock cannot
   * intercept the import.
   */
  private loadEditorComponent = loadDocumentEditor; // NOSONAR - writable for test overrides

  /** Run once the window is gone, so the caller can take the document back. */
  private onClosed: (() => void) | null = null;

  private outlet: DomPortalOutlet | null = null;
  private overlayContainer: PictureInPictureOverlayContainer | null = null;
  private pipWindow: Window | null = null;

  private readonly openState = signal(false);

  /** True while a document is showing in a picture-in-picture window. */
  readonly isOpen = this.openState.asReadonly();

  /** Whether this browser can show a document in such a window at all. */
  isSupported(): boolean {
    return pictureInPictureApi() !== null;
  }

  /**
   * Opens the document in a picture-in-picture window.
   *
   * Must be called from a user gesture — browsers refuse the request
   * otherwise. Any window already open is replaced, since the platform allows
   * only one per tab.
   *
   * @param documentId - Full document ID (`username:slug:elementId`).
   * @param title - Window title, normally the document's name.
   * @param hooks - `onGranted` runs once the browser has agreed to the window
   * but before the editor mounts, which is where the caller should release the
   * document; `onClosed` runs once the window is gone, so the caller can take
   * it back. Nothing is called when the request is refused, so a refusal
   * leaves the caller exactly as it was.
   * @returns True when the window opened; false when the browser has no such
   * API or refused the request, in which case the caller should fall back to
   * opening an ordinary window.
   */
  async open(
    documentId: string,
    title: string,
    hooks?: { onGranted?: () => void; onClosed?: () => void }
  ): Promise<boolean> {
    const api = pictureInPictureApi();
    if (!api) return false;

    this.close();

    let pip: Window;
    try {
      pip = await api.requestWindow({
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
      });
    } catch (error) {
      // Refused for want of a user gesture, or dismissed by the user.
      this.logger.debug(
        'DocumentPip',
        'Picture-in-picture window was refused',
        error
      );
      return false;
    }

    // Only now that the window is certain does the caller give the document
    // up. Doing it earlier means undoing it on every refusal.
    hooks?.onGranted?.();

    try {
      this.pipWindow = pip;
      pip.document.title = title;

      // Twice on purpose, and the second pass is the one that matters.
      // Angular injects a component's styles when it first renders one, so the
      // editor's stylesheets do not exist yet at the first pass — copying only
      // then leaves the floating window showing bare HTML, with default
      // buttons and browser-sized headings. The first pass still earns its
      // keep by giving the editor a styled document to lay itself out in.
      const copied = copyPresentation(document, pip.document);
      await this.mountEditor(pip, documentId);
      copyPresentation(document, pip.document, copied);

      // Closing the window, or the tab that owns it, tears the editor down and
      // hands the document back to whoever asked for it.
      this.onClosed = hooks?.onClosed ?? null;
      pip.addEventListener('pagehide', () => this.close(), { once: true });

      this.openState.set(true);
      return true;
    } catch (error) {
      this.logger.error(
        'DocumentPip',
        'Failed to show the document picture-in-picture',
        error
      );
      this.close();
      return false;
    }
  }

  /**
   * Closes the window and destroys the editor it hosted, then hands the
   * document back to the caller that opened it. Safe to call twice.
   */
  close(): void {
    const onClosed = this.onClosed;
    this.onClosed = null;

    // Disposing destroys the editor, which releases the document's Yjs
    // connection — so it must happen before anyone reopens the document.
    this.outlet?.dispose();
    this.outlet = null;

    this.overlayContainer?.ngOnDestroy();
    this.overlayContainer = null;

    if (this.pipWindow) {
      const closing = this.pipWindow;
      this.pipWindow = null;
      try {
        closing.close();
      } catch {
        // Already gone, or closed by the user.
      }
    }

    const wasOpen = this.openState();
    this.openState.set(false);

    if (wasOpen) onClosed?.();
  }

  /**
   * Renders the document editor into the picture-in-picture body, with
   * overlays pointed at that document rather than the main one.
   */
  private async mountEditor(pip: Window, documentId: string): Promise<void> {
    const host = pip.document.createElement('div');
    host.className = 'inkweld-pip-host';
    pip.document.body.append(host);

    const overlayContainer = runInInjectionContext(
      this.environmentInjector,
      () => new PictureInPictureOverlayContainer()
    );
    overlayContainer.useDocument(pip.document);
    this.overlayContainer = overlayContainer;

    const injector = Injector.create({
      parent: this.environmentInjector,
      providers: [{ provide: OverlayContainer, useValue: overlayContainer }],
    });

    const editorComponent = await this.loadEditorComponent();

    const outlet = new DomPortalOutlet(host, this.appRef, injector);
    this.outlet = outlet;

    const portal = new ComponentPortal<unknown>(
      editorComponent,
      null,
      injector
    );
    const ref: ComponentRef<unknown> = outlet.attachComponentPortal(portal);
    ref.setInput('documentId', documentId);
    ref.changeDetectorRef.detectChanges();
  }
}

/**
 * Gives the picture-in-picture document the look of the main one: every
 * stylesheet, plus the root element's classes and inline custom properties,
 * which is where the theme tokens and background variables live.
 */
function copyPresentation(
  source: Document,
  target: Document,
  alreadyCopied: Set<CSSStyleSheet> = new Set()
): Set<CSSStyleSheet> {
  // styleSheets is where this app's styles actually live. adoptedStyleSheets
  // is empty here, but Angular can be configured to use it, so it is read too
  // — guarded, because not every engine implements it and a missing stylesheet
  // must not be what stops the window from opening.
  const sheets: CSSStyleSheet[] = [
    ...Array.from(source.styleSheets),
    ...(source.adoptedStyleSheets ?? []),
  ];

  for (const sheet of sheets) {
    if (alreadyCopied.has(sheet)) continue;
    alreadyCopied.add(sheet);

    try {
      const rules = Array.from(sheet.cssRules)
        .map(rule => rule.cssText)
        .join('\n');
      const style = target.createElement('style');
      style.textContent = rules;
      target.head.append(style);
    } catch {
      // A cross-origin sheet refuses cssRules; re-link it instead.
      const href = sheet.href;
      if (!href) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      target.head.append(link);
    }
  }

  target.documentElement.className = source.documentElement.className;
  target.documentElement.setAttribute(
    'style',
    source.documentElement.getAttribute('style') ?? ''
  );
  target.body.className = source.body.className;

  return alreadyCopied;
}
