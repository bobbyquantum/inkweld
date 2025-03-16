import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';

import { FileSizePipe } from '../../pipes/file-size.pipe';
import { ProjectFile } from '../../services/project-file.service';

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    FileSizePipe,
  ],
  templateUrl: './file-list.component.html',
  styleUrls: ['./file-list.component.scss'],
})
export class FileListComponent {
  @Input({ required: true }) files: ProjectFile[] = [];
  @Output() deleteFile = new EventEmitter<ProjectFile>();

  protected columns = ['name', 'size', 'type', 'actions'];
}
