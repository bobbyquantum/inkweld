import {
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';

import {
  createDefaultPublishPlan,
  PublishFormat,
  type PublishPlan,
} from '../../../../models/publish-plan';
import { type PublishedFile } from '../../../../models/published-file';
import { PublishedFilesService } from '../../../../services/publish/published-files.service';

@Component({
  selector: 'app-publish-plans-list-tab',
  templateUrl: './publish-plans-list-tab.component.html',
  styleUrls: ['./publish-plans-list-tab.component.scss'],
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
})
export class PublishPlansListTabComponent implements OnInit {
  protected readonly projectState = inject(ProjectStateService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly publishedFilesService = inject(PublishedFilesService);

  /** All publish plans */
  protected plans = computed(() => this.projectState.publishPlans());

  /** Published files grouped by plan name */
  protected publishHistory = signal<Map<string, PublishedFile[]>>(new Map());

  /** Loading state for history */
  protected historyLoading = signal(false);

  /** Currently expanded plan ID for history */
  protected expandedPlanId = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadPublishHistory();
  }

  private async loadPublishHistory(): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    this.historyLoading.set(true);
    try {
      const projectKey = `${project.username}:${project.slug}`;
      const files = await this.publishedFilesService.loadFiles(projectKey);
      const grouped = new Map<string, PublishedFile[]>();
      for (const file of files) {
        const key = file.planName || 'Unknown';
        const existing = grouped.get(key) ?? [];
        existing.push(file);
        grouped.set(key, existing);
      }
      // Sort each group by date descending
      for (const [key, group] of grouped) {
        grouped.set(
          key,
          group.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      }
      this.publishHistory.set(grouped);
    } finally {
      this.historyLoading.set(false);
    }
  }

  createPublishPlan(): void {
    const project = this.projectState.project();
    if (!project) return;

    const plan = createDefaultPublishPlan(
      project.title ?? 'Untitled',
      project.username ?? 'Unknown Author'
    );
    this.projectState.createPublishPlan(plan);
    this.openPublishPlan(plan);
  }

  openPublishPlan(plan: PublishPlan): void {
    const project = this.projectState.project();
    if (!project) return;

    this.projectState.openPublishPlan(plan);
    void this.router.navigate([
      '/',
      project.username,
      project.slug,
      'publish-plan',
      plan.id,
    ]);
  }

  async deletePublishPlan(event: Event, plan: PublishPlan): Promise<void> {
    event.stopPropagation();

    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete Publish Plan',
      message: `Are you sure you want to delete "${plan.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      this.projectState.deletePublishPlan(plan.id);
      this.snackBar.open(`Deleted "${plan.name}"`, 'Close', { duration: 3000 });
    }
  }

  toggleHistory(planId: string): void {
    this.expandedPlanId.update(current => (current === planId ? null : planId));
  }

  getHistoryForPlan(planName: string): PublishedFile[] {
    return this.publishHistory().get(planName) ?? [];
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatFormatName(format: string): string {
    const names: Record<string, string> = {
      [PublishFormat.EPUB]: 'EPUB',
      [PublishFormat.PDF_SIMPLE]: 'PDF',
      [PublishFormat.HTML]: 'HTML',
      [PublishFormat.MARKDOWN]: 'Markdown',
    };
    return names[format] || format;
  }
}
