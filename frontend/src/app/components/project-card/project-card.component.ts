import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { Project } from '@inkweld/index';

import { ProjectCoverComponent } from '../project-cover/project-cover.component';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterModule,
    ProjectCoverComponent,
  ],
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.scss',
})
export class ProjectCardComponent {
  @Input()
  public project!: Project;

  /** When true, shows a shared indicator badge on the card */
  @Input()
  public isShared = false;

  /** The owner's username for shared projects */
  @Input()
  public sharedByUsername?: string;
}
