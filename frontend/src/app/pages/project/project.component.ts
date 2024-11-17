import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTreeModule, MatTreeNestedDataSource } from '@angular/material/tree';
import { ActivatedRoute } from '@angular/router';
import { ProjectElement } from '@components/project-tree/ProjectElement';
import { TREE_DATA } from '@components/project-tree/TREE_DATA';
import { Project, ProjectAPIService, User } from 'worm-api-client';

import { ElementEditorComponent } from '../../components/element-editor/element-editor.component';
import { ProjectMainMenuComponent } from '../../components/project-main-menu/project-main-menu.component';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';

interface FileNode {
  name: string;
  type: string;
  children?: FileNode[];
  expanded?: boolean;
}

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatToolbarModule,
    MatIconModule,
    MatTabsModule,
    MatButtonModule,
    MatTreeModule,
    MatSnackBarModule,
    ProjectTreeComponent,
    ProjectMainMenuComponent,
    ElementEditorComponent,
  ],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss',
})
export class ProjectComponent implements OnInit {
  project: Project | null = null;
  user: User | undefined;

  dataSource = new MatTreeNestedDataSource<FileNode>();

  private route = inject(ActivatedRoute);
  private projectService = inject(ProjectAPIService);
  private snackBar = inject(MatSnackBar);

  treeData: ProjectElement[] = TREE_DATA;

  hasChild = (_: number, node: FileNode) =>
    !!node.children && node.children.length > 0;

  childrenAccessor = (node: FileNode) => node.children ?? [];

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const username = params['username'] as string;
      const slug = params['slug'] as string;
      this.loadProject(username, slug);
    });
  }

  private loadProject(username: string, slug: string): void {
    this.projectService.getProjectByUsernameAndSlug(username, slug).subscribe({
      next: (project: Project) => {
        this.project = project;
      },
      error: error => {
        console.error('Error loading project:', error);
        this.snackBar.open('Failed to load project.', 'Close', {
          duration: 3000,
        });
      },
    });
  }
}
