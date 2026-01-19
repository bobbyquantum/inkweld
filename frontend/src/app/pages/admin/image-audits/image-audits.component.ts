import { DatePipe, NgClass } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ImageViewerDialogComponent,
  ImageViewerDialogData,
} from '@dialogs/image-viewer-dialog/image-viewer-dialog.component';
import {
  AdminImageAuditsService,
  ImageAuditStats,
  ImageGenerationAudit,
} from 'api-client';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-admin-image-audits',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    NgClass,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './image-audits.component.html',
  styleUrl: './image-audits.component.scss',
})
export class AdminImageAuditsComponent implements OnInit {
  private readonly auditService = inject(AdminImageAuditsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly isLoading = signal(false);
  readonly audits = signal<ImageGenerationAudit[]>([]);
  readonly stats = signal<ImageAuditStats | null>(null);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = signal(25);

  // Filters
  readonly statusFilter = signal<'success' | 'moderated' | ''>('');
  readonly searchQuery = signal('');
  private readonly searchSubject = new Subject<string>();

  readonly displayedColumns = [
    'createdAt',
    'username',
    'profileName',
    'prompt',
    'creditCost',
    'status',
    'actions',
  ];

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(query => {
        this.searchQuery.set(query);
        this.page.set(1);
        void this.loadAudits();
      });

    void this.loadAudits();
    void this.loadStats();
  }

  async loadAudits(): Promise<void> {
    this.isLoading.set(true);
    try {
      const result = await firstValueFrom(
        this.auditService.adminListImageAudits(
          undefined, // userId
          undefined, // profileId
          this.statusFilter() || undefined, // status
          undefined, // startDate
          undefined, // endDate
          this.searchQuery() || undefined, // search
          this.page(), // page
          this.limit() // limit
        )
      );
      this.audits.set(result.audits);
      this.total.set(result.total);
    } catch (err) {
      console.error('Failed to load audits:', err);
      this.snackBar.open('Failed to load image audits', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadStats(): Promise<void> {
    try {
      const stats = await firstValueFrom(
        this.auditService.adminGetImageAuditStats()
      );
      this.stats.set(stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  clearSearch(): void {
    this.searchSubject.next('');
  }

  onStatusFilterChange(status: '' | 'success' | 'moderated'): void {
    this.statusFilter.set(status);
    this.page.set(1);
    void this.loadAudits();
  }

  onPageChange(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
    void this.loadAudits();
  }

  truncatePrompt(prompt: string, maxLength = 80): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }

  viewOutputImages(audit: ImageGenerationAudit): void {
    if (!audit.outputImageUrls || audit.outputImageUrls.length === 0) {
      this.snackBar.open('No output images available', 'Dismiss', {
        duration: 2000,
      });
      return;
    }

    this.dialog.open<ImageViewerDialogComponent, ImageViewerDialogData>(
      ImageViewerDialogComponent,
      {
        data: {
          imageUrl: audit.outputImageUrls[0],
          fileName: `Generated Image - ${audit.profileName}`,
        },
        maxWidth: '90vw',
        maxHeight: '90vh',
      }
    );
  }

  refresh(): void {
    void this.loadAudits();
    void this.loadStats();
  }
}
