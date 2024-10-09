import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTreeModule, MatTreeNestedDataSource } from '@angular/material/tree';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { Editor, NgxEditorModule } from 'ngx-editor';
import { ActivatedRoute } from '@angular/router';
import { ProjectAPIService, Project, User } from 'worm-api-client';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';
import { ProjectMainMenuComponent } from '../../components/project-main-menu/project-main-menu.component';

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
    MatButtonModule,
    MatTreeModule,
    UserMenuComponent,
    NgxEditorModule,
    MatSnackBarModule,
    ProjectTreeComponent,
    ProjectMainMenuComponent,
  ],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss',
})
export class ProjectComponent implements OnInit, OnDestroy {
  editor!: Editor;
  project: Project | null = null;
  user: User | undefined;

  dataSource = new MatTreeNestedDataSource<FileNode>();

  private route = inject(ActivatedRoute);
  private projectService = inject(ProjectAPIService);
  private snackBar = inject(MatSnackBar);

  constructor() {
    this.initializeDummyFileStructure();
  }

  hasChild = (_: number, node: FileNode) =>
    !!node.children && node.children.length > 0;

  childrenAccessor = (node: FileNode) => node.children ?? [];

  ngOnInit(): void {
    this.editor = new Editor({});

    this.route.params.subscribe(params => {
      const username = params['username'];
      const slug = params['slug'];
      this.loadProject(username, slug);
    });

    // TODO: Load user data
    // this.loadUserData();
  }

  ngOnDestroy(): void {
    this.editor.destroy();
  }

  private loadProject(username: string, slug: string): void {
    this.projectService.getProjectByUsernameAndSlug(username, slug).subscribe({
      next: (project: Project) => {
        this.project = project;
        // TODO: Load actual file structure from the project
        // this.dataSource.data = this.buildFileTree(project.files);
      },
      error: error => {
        console.error('Error loading project:', error);
        this.snackBar.open('Failed to load project.', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  private initializeDummyFileStructure(): void {
    const TREE_DATA: FileNode[] = [
      {
        name: 'Project Files',
        type: 'folder',
        children: [
          {
            name: 'src',
            type: 'folder',
            children: [
              { name: 'index.html', type: 'file' },
              { name: 'styles.css', type: 'file' },
              { name: 'app.js', type: 'file' },
            ],
          },
          {
            name: 'assets',
            type: 'folder',
            children: [
              { name: 'logo.png', type: 'file' },
              { name: 'background.jpg', type: 'file' },
            ],
          },
          { name: 'README.md', type: 'file' },
        ],
      },
    ];
    this.dataSource.data = TREE_DATA;
  }

  // TODO: Implement this method to build the file tree from project data
  // private buildFileTree(files: any[]): FileNode[] {
  //   // Convert the flat file structure to a nested tree structure
  // }

  // TODO: Implement method to load user data
  // private loadUserData(): void {
  //   // Load user data and assign it to this.user
  // }
}
