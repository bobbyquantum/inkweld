import {
  ChangeDetectionStrategy,
  Component,
  Input,
  provideZonelessChangeDetection,
  type Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentPipService } from './document-pip.service';
import { LoggerService } from './logger.service';

/** Stands in for the real editor, which drags in the whole ProseMirror stack. */
@Component({
  selector: 'app-stub-editor',
  changeDetection: ChangeDetectionStrategy.Eager,
  template:
    '<span class="stub-editor">{{ documentId }} tabsDisabled={{ tabsDisabled }}</span>',
})
class StubEditorComponent {
  @Input() documentId = '';
  @Input() tabsDisabled = false;
}

describe('DocumentPipService', () => {
  let service: DocumentPipService;
  let pipDocument: Document;
  let pipWindow: Window;
  let closeSpy: ReturnType<typeof vi.fn>;
  let requestWindow: ReturnType<typeof vi.fn>;
  let pagehideListener: (() => void) | null;

  /** Installs (or removes) a fake Document Picture-in-Picture API. */
  function setApi(api: unknown): void {
    Object.defineProperty(globalThis, 'documentPictureInPicture', {
      value: api,
      configurable: true,
      writable: true,
    });
  }

  /** Points the service's editor loader at the stub above. */
  function useStubEditor(): void {
    (
      service as unknown as {
        loadEditorComponent: () => Promise<Type<unknown>>;
      }
    ).loadEditorComponent = () => Promise.resolve(StubEditorComponent);
  }

  beforeEach(() => {
    pipDocument = document.implementation.createHTMLDocument('pip');
    closeSpy = vi.fn();
    pagehideListener = null;

    pipWindow = {
      document: pipDocument,
      close: closeSpy,
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'pagehide') pagehideListener = listener;
      },
    } as unknown as Window;

    requestWindow = vi.fn().mockResolvedValue(pipWindow);
    setApi({ requestWindow, window: null });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DocumentPipService,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            group: vi.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(DocumentPipService);
    useStubEditor();
  });

  afterEach(() => {
    service.close();
    Reflect.deleteProperty(globalThis, 'documentPictureInPicture');
  });

  it('reports support when the browser offers the API', () => {
    expect(service.isSupported()).toBe(true);
  });

  it('reports no support when the browser does not', () => {
    setApi(undefined);

    expect(service.isSupported()).toBe(false);
  });

  it('declines to open where the API is missing, so the caller can fall back', async () => {
    setApi(undefined);

    await expect(service.open('u:s:el-1', 'Chapter 1')).resolves.toBe(false);
  });

  it('declines to open when the browser refuses the request', async () => {
    requestWindow.mockRejectedValue(new Error('user gesture required'));

    await expect(service.open('u:s:el-1', 'Chapter 1')).resolves.toBe(false);
    expect(service.isOpen()).toBe(false);
  });

  it('asks for a window and reports that it opened', async () => {
    await expect(service.open('u:s:el-1', 'Chapter 1')).resolves.toBe(true);

    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(service.isOpen()).toBe(true);
  });

  it('names the window after the document', async () => {
    await service.open('u:s:el-1', 'Chapter 1');

    expect(pipDocument.title).toBe('Chapter 1');
  });

  it('renders the editor for the requested document', async () => {
    await service.open('u:s:el-1', 'Chapter 1');

    const host = pipDocument.querySelector('.inkweld-pip-host');
    expect(host).not.toBeNull();
    expect(host?.textContent).toContain('u:s:el-1');
  });

  it('tells the editor there is no tab bar to leave room for', async () => {
    // The editor reserves 50px for the tab bar unless told otherwise, which in
    // a window that has none leaves it short and the status bar off-place.
    await service.open('u:s:el-1', 'Chapter 1');

    const host = pipDocument.querySelector('.inkweld-pip-host');
    expect(host?.querySelector('.stub-editor')?.textContent).toContain(
      'tabsDisabled=true'
    );
  });

  it('carries the page styling across to the new window', async () => {
    document.documentElement.style.setProperty('--probe-token', 'carried');
    document.body.classList.add('dark-theme');

    await service.open('u:s:el-1', 'Chapter 1');

    expect(
      pipDocument.documentElement.style.getPropertyValue('--probe-token')
    ).toBe('carried');
    expect(pipDocument.body.classList.contains('dark-theme')).toBe(true);

    document.documentElement.style.removeProperty('--probe-token');
    document.body.classList.remove('dark-theme');
  });

  it('carries component styles across, not just the global sheets', async () => {
    // Angular keeps component styles in adoptedStyleSheets, which
    // document.styleSheets does not include. Missing them renders the editor
    // as bare HTML: default buttons and browser-sized headings.
    // Stubbed rather than constructed: the test DOM does not implement
    // adoptedStyleSheets, and the point here is that the copy reads it at all.
    const sheet = {
      cssRules: [{ cssText: '.pip-probe { color: rgb(1, 2, 3); }' }],
    } as unknown as CSSStyleSheet;
    const previous = Object.getOwnPropertyDescriptor(
      document,
      'adoptedStyleSheets'
    );
    Object.defineProperty(document, 'adoptedStyleSheets', {
      value: [sheet],
      configurable: true,
    });

    try {
      await service.open('u:s:el-1', 'Chapter 1');

      const copied = [...pipDocument.querySelectorAll('style')]
        .map(el => el.textContent ?? '')
        .join('\n');
      expect(copied).toContain('.pip-probe');
    } finally {
      if (previous) {
        Object.defineProperty(document, 'adoptedStyleSheets', previous);
      } else {
        Reflect.deleteProperty(document, 'adoptedStyleSheets');
      }
    }
  });

  it('does not copy the same sheet twice', async () => {
    await service.open('u:s:el-1', 'Chapter 1');

    const texts = [...pipDocument.querySelectorAll('style')].map(
      el => el.textContent ?? ''
    );
    const nonEmpty = texts.filter(t => t.trim().length > 0);

    expect(new Set(nonEmpty).size).toBe(nonEmpty.length);
  });

  it('gives Material overlays a home in the new window', async () => {
    await service.open('u:s:el-1', 'Chapter 1');

    // Menus and tooltips raised from the popped-out editor must not appear in
    // the window behind it. The container is built on demand, as CDK's own is,
    // so ask for it the way Material would.
    const container = (
      service as unknown as {
        overlayContainer: { getContainerElement: () => HTMLElement };
      }
    ).overlayContainer.getContainerElement();

    expect(container.ownerDocument).toBe(pipDocument);
    expect(container.classList.contains('cdk-overlay-container')).toBe(true);
    expect(document.body.contains(container)).toBe(false);
  });

  it('closes the window and forgets it', async () => {
    await service.open('u:s:el-1', 'Chapter 1');

    service.close();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(service.isOpen()).toBe(false);
  });

  it('tolerates being closed twice', async () => {
    await service.open('u:s:el-1', 'Chapter 1');
    service.close();

    expect(() => service.close()).not.toThrow();
  });

  it('tears down when the user closes the window', async () => {
    await service.open('u:s:el-1', 'Chapter 1');
    expect(pagehideListener).not.toBeNull();

    pagehideListener?.();

    expect(service.isOpen()).toBe(false);
  });

  it('replaces the window already open, since only one is allowed', async () => {
    await service.open('u:s:el-1', 'Chapter 1');
    await service.open('u:s:el-2', 'Chapter 2');

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(requestWindow).toHaveBeenCalledTimes(2);
    expect(service.isOpen()).toBe(true);
  });
});
