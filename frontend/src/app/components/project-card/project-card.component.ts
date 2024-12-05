import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterModule } from '@angular/router';
import { Project } from 'worm-api-angular-client';

@Component({
    selector: 'app-project-card',
    imports: [MatCardModule, MatButtonModule, RouterModule],
    templateUrl: './project-card.component.html',
    styleUrl: './project-card.component.scss'
})
export class ProjectCardComponent {
  @Input()
  public project!: Project;
}
