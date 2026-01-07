import { Component, inject } from '@angular/core';
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
  version: string;
  description: string;
  url: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
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

  readonly appVersion = packageJson.version;
  readonly appName = 'Inkweld';
  readonly appDescription = packageJson.description;

  readonly keyLibraries: LibraryInfo[] = [
    {
      name: 'Angular',
      version: '21.0.6',
      description:
        'A platform for building mobile and desktop web applications',
      url: 'https://angular.dev',
    },
    {
      name: 'Angular Material',
      version: '21.0.5',
      description: 'Material Design components for Angular',
      url: 'https://material.angular.io',
    },
    {
      name: 'Yjs',
      version: '13.6.29',
      description: 'A CRDT framework for building collaborative applications',
      url: 'https://yjs.dev',
    },
    {
      name: 'ProseMirror',
      version: '1.41.4',
      description: 'A toolkit for building rich-text editors',
      url: 'https://prosemirror.net',
    },
    {
      name: 'Hono',
      version: '4.x',
      description: 'A small, simple, and ultrafast web framework for the edge',
      url: 'https://hono.dev',
    },
    {
      name: 'Drizzle ORM',
      version: '0.x',
      description: 'TypeScript ORM that is lightweight and performant',
      url: 'https://orm.drizzle.team',
    },
  ];

  readonly currentYear = new Date().getFullYear();

  goBack(): void {
    void this.router.navigate(['/']);
  }

  openLicenses(): void {
    window.open('/3rdpartylicenses.txt', '_blank');
  }

  openExternalLink(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
