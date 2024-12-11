import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { firstValueFrom } from 'rxjs';
import { FileAPIService, FileUpload, PageInfo } from 'worm-api-angular-client';

@Component({
  selector: 'app-user-files-dialog',
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
  public files: FileUpload[] = [];
  public pageSize = 12; // Adjust as needed
  public pageSizeOptions: number[] = [12, 24, 48, 96];

  private fileService = inject(FileAPIService);

  ngOnInit() {
    void this.loadFiles(0, this.pageSize);
  }

  async loadFiles(pageIndex: number, pageSize: number): Promise<void> {
    const response = await firstValueFrom(
      this.fileService.searchFiles({
        page: pageIndex,
        size: pageSize,
      })
    );
    this.files = response.content as FileUpload[];
    this.page = response.page!;
  }

  onPageChange(event: PageEvent): void {
    void this.loadFiles(event.pageIndex, event.pageSize);
  }
}
