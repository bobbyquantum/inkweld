import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { type Element, ElementType } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { SetupService } from '@services/core/setup.service';
import {
  createAuthenticatedWebsocketProvider,
  setupReauthentication,
} from '@services/sync/authenticated-websocket-provider';
import { appOrigin } from '@utils/app-base';
import { firstValueFrom } from 'rxjs';
import type { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { environment } from '../../../environments/environment';

interface PublicProject {
  username: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
}

type PublicProjectState = 'loading' | 'ready' | 'unavailable' | 'error';

function getXmlText(node: Y.XmlElement | Y.XmlHook | Y.XmlText): string {
  if (node instanceof Y.XmlText) return String(node);
  if (node instanceof Y.XmlHook) {
    const data: unknown = node.toJSON();
    return `[${node.hookName}: ${JSON.stringify(data) ?? '{}'}]`;
  }

  if (node.nodeName === 'image') {
    const attributes = node.getAttributes();
    return `[Image${attributes['alt'] ? `: ${attributes['alt']}` : ''}${
      attributes['src'] ? ` (${attributes['src']})` : ''
    }]`;
  }

  const contents = node.toArray().map(getXmlText).join('');
  return ['paragraph', 'heading', 'blockquote', 'listItem'].includes(
    node.nodeName
  )
    ? `${contents}\n`
    : contents;
}

@Component({
  selector: 'app-public-project',
  imports: [TranslocoModule],
  templateUrl: './public-project.component.html',
  styleUrl: './public-project.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicProjectComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  protected readonly state = signal<PublicProjectState>('loading');
  protected readonly project = signal<PublicProject | null>(null);
  protected readonly elements = signal<Element[]>([]);
  protected readonly selectedElement = signal<Element | null>(null);
  protected readonly content = signal('');
  protected readonly contentLoading = signal(false);
  protected readonly isLive = signal(false);
  protected readonly coverUrl = signal<string | null>(null);

  private elementsDoc: Y.Doc | null = null;
  private elementsProvider: WebsocketProvider | null = null;
  private contentDoc: Y.Doc | null = null;
  private contentProvider: WebsocketProvider | null = null;
  private elementObserver: (() => void) | null = null;
  private contentObserver: (() => void) | null = null;

  ngOnInit(): void {
    const username = this.route.snapshot.paramMap.get('username');
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!username || !slug) {
      this.state.set('unavailable');
      return;
    }
    void this.loadProject(username, slug);
  }

  ngOnDestroy(): void {
    this.closeContentDocument();
    this.elementsProvider?.destroy();
    this.elementsDoc?.destroy();
  }

  protected async openElement(element: Element): Promise<void> {
    if (element.type === ElementType.Folder) return;

    this.closeContentDocument();
    this.selectedElement.set(element);
    this.content.set('');
    this.contentLoading.set(true);

    const doc = new Y.Doc();
    this.contentDoc = doc;
    const renderContent = () => {
      const fragment = doc.getXmlFragment('prosemirror');
      if (fragment.length > 0) {
        this.content.set(fragment.toArray().map(getXmlText).join('').trim());
        return;
      }

      const worldbuilding = doc.getMap('worldbuilding').toJSON();
      const value =
        Object.keys(worldbuilding).length > 0 ? worldbuilding : doc.toJSON();
      this.content.set(JSON.stringify(value, null, 2));
    };
    this.contentObserver = renderContent;
    doc.on('update', this.contentObserver);

    try {
      const project = this.project();
      if (!project) return;
      const wsUrl = this.createWebSocketUrl(
        `${project.username}:${project.slug}:${element.id}`
      );
      const provider = await createAuthenticatedWebsocketProvider(
        wsUrl,
        '',
        doc,
        'public-view'
      );
      if (this.contentDoc !== doc) {
        provider.destroy();
        return;
      }
      this.contentProvider = provider;
      setupReauthentication(
        provider,
        () => 'public-view',
        message => {
          console.error(
            'Public project content connection was denied:',
            message
          );
        }
      );
      renderContent();
      this.contentLoading.set(false);
    } catch (error) {
      console.error('Failed to load public project content:', error);
      if (this.contentDoc === doc) {
        this.content.set('');
        this.contentLoading.set(false);
      }
    }
  }

  protected isFolder(element: Element): boolean {
    return element.type === ElementType.Folder;
  }

  private async loadProject(username: string, slug: string): Promise<void> {
    try {
      const serverUrl = this.getServerUrl();
      const project = await firstValueFrom(
        this.http.get<PublicProject>(
          `${serverUrl}/api/v1/share/projects/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
        )
      );
      this.project.set(project);
      if (project.coverImage) {
        this.coverUrl.set(
          `${this.getServerUrl()}/api/v1/projects/${encodeURIComponent(project.username)}/${encodeURIComponent(project.slug)}/cover`
        );
      }
      await this.connectElements(project);
      this.state.set('ready');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.state.set('unavailable');
        return;
      }
      console.error('Failed to load public project:', error);
      this.state.set('error');
    }
  }

  private async connectElements(project: PublicProject): Promise<void> {
    const doc = new Y.Doc();
    this.elementsDoc = doc;
    const array = doc.getArray<Element>('elements');
    this.elementObserver = () => {
      const elements = array.toArray();
      this.elements.set(elements);
      const selected = this.selectedElement();
      if (selected && !elements.some(element => element.id === selected.id)) {
        this.closeContentDocument();
        this.selectedElement.set(null);
      }
    };
    array.observe(this.elementObserver);

    const provider = await createAuthenticatedWebsocketProvider(
      this.createWebSocketUrl(`${project.username}:${project.slug}:elements`),
      '',
      doc,
      'public-view'
    );
    if (this.elementsDoc !== doc) {
      provider.destroy();
      return;
    }
    this.elementsProvider = provider;
    setupReauthentication(
      provider,
      () => 'public-view',
      message => {
        console.error('Public project live connection was denied:', message);
      }
    );
    this.isLive.set(true);
    provider.on('status', ({ status }: { status: string }) => {
      this.isLive.set(status === 'connected');
    });
    this.elementObserver();
  }

  private closeContentDocument(): void {
    this.contentProvider?.destroy();
    this.contentProvider = null;
    if (this.contentDoc) {
      if (this.contentObserver) {
        this.contentDoc.off('update', this.contentObserver);
      }
      this.contentDoc.destroy();
      this.contentDoc = null;
    }
    this.contentObserver = null;
    this.contentLoading.set(false);
  }

  private getServerUrl(): string {
    const url =
      environment.apiUrl || appOrigin() || this.setupService.getServerUrl();
    if (!url) throw new Error('Public project server URL is unavailable');
    return url.replace(/\/+$/, '');
  }

  private createWebSocketUrl(documentId: string): string {
    const configuredUrl = environment.wssUrl;
    const baseUrl = configuredUrl || this.getServerUrl();
    const url = new URL(baseUrl, globalThis.location.origin);
    url.protocol =
      url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/v1/ws/yjs`;
    url.searchParams.set('documentId', documentId);
    return url.toString();
  }
}
