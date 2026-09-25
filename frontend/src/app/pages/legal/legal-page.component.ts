import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ConfigurationService } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';
import { marked } from 'marked';
import { firstValueFrom } from 'rxjs';

export type LegalDocumentKind = 'privacy' | 'terms';

type LegalPageState =
  | { kind: 'loading' }
  | { kind: 'content'; html: string }
  | { kind: 'redirecting'; url: string }
  | { kind: 'not-configured' }
  | { kind: 'error' };

/** Only hand the browser http(s) targets — never javascript:, data:, etc. */
function isSafeRedirect(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Anonymous /privacy and /terms pages. Renders the admin's hosted Markdown
 * (PRIVACY_POLICY_CONTENT / TERMS_OF_SERVICE_CONTENT), or redirects to the
 * external URL when only that is configured. Which document is shown comes
 * from the route's `data.document`.
 *
 * The Markdown is admin-authored, but it still goes through Angular's
 * [innerHTML] sanitizer so a pasted policy cannot run script.
 */
@Component({
  selector: 'app-legal-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoModule,
  ],
  templateUrl: './legal-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './legal-page.component.scss',
})
export class LegalPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly configApi = inject(ConfigurationService);
  private readonly systemConfig = inject(SystemConfigService);
  private readonly document = inject(DOCUMENT);

  readonly kind: LegalDocumentKind =
    this.route.snapshot.data['document'] === 'terms' ? 'terms' : 'privacy';
  readonly otherKind: LegalDocumentKind =
    this.kind === 'privacy' ? 'terms' : 'privacy';
  readonly state = signal<LegalPageState>({ kind: 'loading' });
  readonly contentHtml = computed(() => {
    const state = this.state();
    return state.kind === 'content' ? state.html : '';
  });
  readonly hasOtherDocument =
    this.kind === 'privacy'
      ? this.systemConfig.hasTerms
      : this.systemConfig.hasPrivacyPolicy;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.systemConfig.isLocalMode()) {
      this.state.set({ kind: 'not-configured' });
      return;
    }
    try {
      const doc = await firstValueFrom(
        this.configApi.getLegalDocument(this.kind)
      );
      if (doc.content) {
        this.state.set({
          kind: 'content',
          html: await marked.parse(doc.content),
        });
      } else if (doc.url && isSafeRedirect(doc.url)) {
        this.state.set({ kind: 'redirecting', url: doc.url });
        this.redirect(doc.url);
      } else {
        this.state.set({ kind: 'not-configured' });
      }
    } catch (error) {
      this.state.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? { kind: 'not-configured' }
          : { kind: 'error' }
      );
    }
  }

  /** Separate so tests can observe it without leaving the page. */
  protected redirect(url: string): void {
    this.document.location.replace(url);
  }
}
