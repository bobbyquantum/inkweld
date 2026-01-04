import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  ChangelogService,
  ChangelogVersion,
} from '@services/core/changelog.service';

export interface SafeChangelogVersion extends Omit<
  ChangelogVersion,
  'content'
> {
  content: SafeHtml;
}

@Component({
  selector: 'app-changelog',
  standalone: true,
  imports: [CommonModule, MatExpansionModule, MatIconModule, MatButtonModule],
  templateUrl: './changelog.component.html',
  styleUrl: './changelog.component.scss',
})
export class ChangelogComponent implements OnInit {
  private changelogService = inject(ChangelogService);
  private sanitizer = inject(DomSanitizer);

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
        this.error.set('Failed to load changelog. Please try again later.');
        this.loading.set(false);
      },
    });
  }

  goBack(): void {
    window.history.back();
  }
}
