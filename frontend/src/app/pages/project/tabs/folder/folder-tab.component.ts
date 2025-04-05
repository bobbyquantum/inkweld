import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectStateService } from '@services/project-state.service';

import { FolderElementEditorComponent } from '../../../../components/folder-element-editor/folder-element-editor.component';

@Component({
  selector: 'app-folder-tab',
  templateUrl: './folder-tab.component.html',
  styleUrls: ['./folder-tab.component.scss'],
  standalone: true,
  imports: [FolderElementEditorComponent],
})
export class FolderTabComponent implements OnInit {
  private elementId: string = '';

  protected readonly projectState = inject(ProjectStateService);
  protected readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    // Get the folder ID from the route params
    this.elementId = this.route.snapshot.paramMap.get('tabId') || '';
  }

  getElementId(): string {
    return this.elementId;
  }
}
