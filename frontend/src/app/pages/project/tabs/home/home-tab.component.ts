import { Component, EventEmitter, inject, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import { ProjectImportExportService } from '@services/project-import-export.service';
import { ProjectStateService } from '@services/project-state.service';

import { RecentFilesService } from '../../../../services/recent-files.service';

@Component({
  selector: 'app-home-tab',
  templateUrl: './home-tab.component.html',
  styleUrls: ['./home-tab.component.scss'],
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterModule],
})
export class HomeTabComponent {
  @Output() importRequested = new EventEmitter<void>();

  protected readonly projectState = inject(ProjectStateService);
  protected readonly recentFilesService = inject(RecentFilesService);
  protected readonly importExportService = inject(ProjectImportExportService);
  protected readonly dialogGateway = inject(DialogGatewayService);
  // Router for navigation
  protected readonly router = inject(Router);

  onRecentDocumentClick(documentId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === documentId);
    if (element) {
      this.projectState.openDocument(element);
      const project = this.projectState.project();
      if (project) {
        const typeRoute = element.type === 'FOLDER' ? 'folder' : 'document';
        void this.router.navigate([
          '/',
          project.username,
          project.slug,
          typeRoute,
          element.id,
        ]);
      }
    }
  }

  onRecentDocumentKeydown(event: KeyboardEvent, documentId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      this.onRecentDocumentClick(documentId);
    }
  }

  onExportClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.importExportService.exportProjectZip();
    }
  }

  onGenerateCoverClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.dialogGateway
        .openGenerateCoverDialog(project)
        .then((approved: boolean) => {
          if (approved) {
            console.log(
              'Cover image approved - ready for implementation of saving function'
            );
            // In the future: save the approved image to the project
          }
        });
    }
  }

  onImportClick(): void {
    const project = this.projectState.project();
    if (project) {
      this.importRequested.emit();
    }
  }

  onPublishClick(): void {
    const project = this.projectState.project();
    console.log('Publishing project:', project);
    if (project) {
      void this.projectState.publishProject(project);
    }
  }

  /**
   * Opens the project files tab
   */
  openProjectFilesTab(): void {
    this.projectState.openSystemTab('project-files');
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'project-files',
      ]);
    }
  }

  /**
   * Opens the documents tab
   */
  openDocumentsTab(): void {
    this.projectState.openSystemTab('documents-list');
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'documents-list',
      ]);
    }
  }
}
