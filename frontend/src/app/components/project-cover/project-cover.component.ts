import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '@inkweld/index';
import { environment } from '../../../environments/environment';

export type ProjectCoverVariant = 'card' | 'list' | 'small';

@Component({
  selector: 'app-project-cover',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-cover.component.html',
  styleUrls: ['./project-cover.component.scss']
})
export class ProjectCoverComponent {
  @Input() project!: Project;
  @Input() variant: ProjectCoverVariant = 'card';

  get hasCover(): boolean {
    return this.project?.coverImage != null;
  }

  get coverUrl(): string | null {
    if (!this.project?.coverImage) {
      return null;
    }

    const baseUrl = environment.production
      ? window.location.origin
      : environment.apiUrl;

    return `${baseUrl}/api/v1/projects/${this.project.username}/${this.project.slug}/cover`;
  }
}
