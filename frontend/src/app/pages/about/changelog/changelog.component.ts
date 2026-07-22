import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import {
  ChangelogService,
  type ChangelogVersion,
} from '@services/core/changelog.service';

export interface SafeChangelogVersion extends Omit<
  ChangelogVersion,
  'content'
> {
  content: SafeHtml;
}

@Component({
  selector: 'app-changelog',
  imports: [
    CommonModule,
    MatExpansionModule,
    MatIconModule,
    MatButtonModule,
    TranslocoModule,
  ],
  templateUrl: './changelog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './changelog.component.scss',
})
export class ChangelogComponent implements OnInit {
  private readonly changelogService = inject(ChangelogService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly transloco = inject(TranslocoService);

  versions = signal<SafeChangelogVersion[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.changelogService.getChangelog().subscribe({
      next: data => {
        const safeData = data.map(v => ({
          ...v,
          content: this.sanitizer.bypassSecurityTrustHtml(v.content),
        }));
        this.versions.set(safeData);
        this.loading.set(false);
      },
      error: err => {
        console.error('Failed to load changelog', err);
        this.error.set(this.transloco.translate('errors.loadFailed'));
        this.loading.set(false);
      },
    });
  }

  goBack(): void {
    globalThis.history.back();
  }
}
