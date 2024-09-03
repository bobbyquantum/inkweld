import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FileAPIService, ModelFile, PageInfo } from 'worm-api-client';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-files-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatGridListModule,
    MatPaginatorModule,
    MatDialogModule,
  ],
  templateUrl: './user-files-dialog.component.html',
  styleUrls: ['./user-files-dialog.component.scss'],
})
export class UserFilesDialogComponent implements OnInit {
  public page?: PageInfo;
  public files: ModelFile[] = [];
  public pageSize = 12; // Adjust as needed
  public pageSizeOptions: number[] = [12, 24, 48, 96];

  constructor(protected fileService: FileAPIService) {}

  async ngOnInit(): Promise<void> {
    await this.loadFiles(0, this.pageSize);
  }

  async loadFiles(pageIndex: number, pageSize: number): Promise<void> {
    const response = await firstValueFrom(
      this.fileService.searchFiles({
        page: pageIndex,
        size: pageSize,
      })
    );
    this.files = response.content as ModelFile[];
    this.page = response.page as PageInfo;
  }

  onPageChange(event: PageEvent): void {
    this.loadFiles(event.pageIndex, event.pageSize);
  }
}
