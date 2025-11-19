import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterModule } from '@angular/router';
import { Project } from '@inkweld/index';

import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, RouterModule],
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.scss',
})
export class ProjectCardComponent {
  @Input()
  public project!: Project;

  /**
   * Check if the project has a cover image
   */
  hasCover(): boolean {
    return this.project.coverImage != null;
  }

  /**
   * Get the URL for the project's cover image
   */
  getCoverUrl(): string | null {
    // Check if project has a cover image set
    if (!this.project.coverImage) {
      return null;
    }

    const baseUrl = environment.production
      ? window.location.origin
      : environment.apiUrl;

    return `${baseUrl}/api/v1/projects/${this.project.username}/${this.project.slug}/cover`;
  }
}
