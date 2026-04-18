import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import packageJson from '@package';
import { UnifiedUserService } from '@services/user/unified-user.service';

interface LibraryInfo {
  name: string;
  version?: string;
  description: string;
  url: string;
}

function stripSemverPrefix(version: string): string {
  return version.replace(/^\D*/, '');
}

@Component({
  selector: 'app-about',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    RouterModule,
    UserMenuComponent,
  ],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  protected router = inject(Router);
  protected userService = inject(UnifiedUserService);
  private readonly http = inject(HttpClient);

  readonly appVersion = packageJson.version;
  readonly commitHash = signal<string | null>(null);
  readonly appName = 'Inkweld';
  readonly appDescription = packageJson.description;

  readonly keyLibraries: LibraryInfo[] = [
    {
      name: 'Angular',
      version: stripSemverPrefix(packageJson.dependencies['@angular/core']),
      description:
        'A platform for building mobile and desktop web applications',
      url: 'https://angular.dev',
    },
    {
      name: 'Angular Material',
      version: stripSemverPrefix(packageJson.dependencies['@angular/material']),
      description: 'Material Design components for Angular',
      url: 'https://material.angular.io',
    },
    {
      name: 'Yjs',
      version: stripSemverPrefix(packageJson.dependencies['yjs']),
      description: 'A CRDT framework for building collaborative applications',
      url: 'https://yjs.dev',
    },
    {
      name: 'ProseMirror',
      version: stripSemverPrefix(packageJson.dependencies['prosemirror-view']),
      description: 'A toolkit for building rich-text editors',
      url: 'https://prosemirror.net',
    },
    {
      name: 'Hono',
      description: 'A small, simple, and ultrafast web framework for the edge',
      url: 'https://hono.dev',
    },
    {
      name: 'Drizzle ORM',
      description: 'TypeScript ORM that is lightweight and performant',
      url: 'https://orm.drizzle.team',
    },
  ];

  readonly currentYear = new Date().getFullYear();

  constructor() {
    this.http.get('/assets/version.txt', { responseType: 'text' }).subscribe({
      next: text => {
        const hash = text.trim();
        if (/^[0-9a-f]{7,40}$/i.test(hash)) {
          this.commitHash.set(hash);
        }
      },
      error: () => {
        /* version.txt only exists in production builds */
      },
    });
  }

  goBack(): void {
    void this.router.navigate(['/']);
  }

  openLicenses(): void {
    globalThis.open('/3rdpartylicenses.txt', '_blank');
  }

  openExternalLink(url: string): void {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }
}
