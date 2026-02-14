import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { ElementType } from '@inkweld/index';
import { firstValueFrom, Subscription } from 'rxjs';

import { ProjectCoverComponent } from '../../../../components/project-cover/project-cover.component';
import {
  PublishCompleteDialogComponent,
  PublishCompleteDialogData,
  PublishCompleteDialogResult,
} from '../../../../dialogs/publish-complete-dialog/publish-complete-dialog.component';
import {
  BackmatterType,
  ChapterNumbering,
  ElementItem,
  FrontmatterType,
  PublishFormat,
  PublishPlan,
  PublishPlanItem,
  PublishPlanItemType,
  SeparatorStyle,
} from '../../../../models/publish-plan';
import { PublishedFile } from '../../../../models/published-file';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import {
  PublishingResult,
  PublishService,
} from '../../../../services/publish/publish.service';
import { WorldbuildingService } from '../../../../services/worldbuilding/worldbuilding.service';

@Component({
  selector: 'app-publish-plan-tab',
  templateUrl: './publish-plan-tab.component.html',
  styleUrls: ['./publish-plan-tab.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    ProjectCoverComponent,
  ],
})
export class PublishPlanTabComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  protected projectState = inject(ProjectStateService);
  private publishService = inject(PublishService);
  private snackBar = inject(MatSnackBar);
  private worldbuildingService = inject(WorldbuildingService);
  private paramSubscription: Subscription | null = null;

  /** Expose ElementType for template */
  protected readonly ElementType = ElementType;

  /** The plan ID from route params */
  protected planId = signal<string>('');

  /** The current plan from state */
  protected plan = computed((): PublishPlan | null => {
    const id = this.planId();
    if (!id) return null;
    return this.projectState.getPublishPlan(id) ?? null;
  });

  /** Local working copy of the plan */
  protected localPlan = signal<PublishPlan | null>(null);

  /** Track if changes are pending */
  protected hasChanges = signal(false);

  /** Expandable sections */
  protected metadataExpanded = signal(true);
  protected optionsExpanded = signal(false);
  protected itemsExpanded = signal(true);

  /** Show add item menu */
  protected showAddItemMenu = signal(false);

  /** Available formats */
  protected readonly formats = Object.values(PublishFormat);
  protected readonly chapterNumberings = Object.values(ChapterNumbering);
  protected readonly frontmatterTypes = Object.values(FrontmatterType);
  protected readonly backmatterTypes = Object.values(BackmatterType);
  protected readonly separatorStyles = Object.values(SeparatorStyle);

  /** Project elements for adding to plan */
  protected elements = computed(() => this.projectState.elements());

  /** Filter to only document elements (not folders) */
  protected documentElements = computed(() =>
    this.elements().filter(e => e.type !== ElementType.Folder)
  );

  /** Get project cover image URL */
  protected projectCoverImage = computed(
    () => this.projectState.project()?.coverImage ?? null
  );

  /** Get the working plan (local copy or original) */
  protected workingPlan = computed((): PublishPlan | null => {
    return this.localPlan() ?? this.plan();
  });

  constructor() {
    // Watch for plan changes and update local copy
    effect(() => {
      const plan = this.plan();
      if (plan && !this.localPlan()) {
        this.localPlan.set({ ...plan });
      }
    });
  }

  ngOnInit(): void {
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const newPlanId = params.get('tabId') || '';
      this.planId.set(newPlanId);

      // Reset local state for new plan
      const plan = this.projectState.getPublishPlan(newPlanId);
      if (plan) {
        this.localPlan.set({ ...plan });
        this.hasChanges.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.paramSubscription) {
      this.paramSubscription.unsubscribe();
      this.paramSubscription = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Plan Name & Format
  // ─────────────────────────────────────────────────────────────────────────────

  updateName(event: Event): void {
    const plan = this.localPlan();
    if (!plan) return;
    const name = (event.target as HTMLInputElement).value;
    this.localPlan.set({ ...plan, name });
    this.hasChanges.set(true);
  }

  updateFormat(event: Event): void {
    const plan = this.localPlan();
    if (!plan) return;
    const format = (event.target as HTMLSelectElement).value as PublishFormat;
    this.localPlan.set({ ...plan, format });
    this.hasChanges.set(true);
  }

  /** Handle mat-select format change */
  updateFormatSelect(event: { value: PublishFormat }): void {
    const plan = this.localPlan();
    if (!plan) return;
    this.localPlan.set({ ...plan, format: event.value });
    this.hasChanges.set(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────────

  updateMetadata(field: string, event: Event): void {
    const plan = this.localPlan();
    if (!plan) return;
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement)
      .value;
    this.localPlan.set({
      ...plan,
      metadata: { ...plan.metadata, [field]: value },
    });
    this.hasChanges.set(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Options
  // ─────────────────────────────────────────────────────────────────────────────

  updateOption(option: string, event: Event): void {
    const plan = this.localPlan();
    if (!plan) return;
    const target = event.target as HTMLInputElement;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.localPlan.set({
      ...plan,
      options: { ...plan.options, [option]: value },
    });
    this.hasChanges.set(true);
  }

  /** Handle mat-checkbox change */
  updateOptionCheckbox(option: string, event: { checked: boolean }): void {
    const plan = this.localPlan();
    if (!plan) return;
    this.localPlan.set({
      ...plan,
      options: { ...plan.options, [option]: event.checked },
    });
    this.hasChanges.set(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Items Management
  // ─────────────────────────────────────────────────────────────────────────────

  dropItem(event: CdkDragDrop<PublishPlanItem[]>): void {
    const plan = this.localPlan();
    if (!plan) return;

    const items = [...plan.items];
    moveItemInArray(items, event.previousIndex, event.currentIndex);

    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
  }

  /** Handle element selection from dropdown */
  onElementSelected(event: { value: string | null }): void {
    if (event.value) {
      this.addElement(event.value);
    }
  }

  /** Get icon for element type */
  getElementIcon(element: {
    type: ElementType;
    schemaId?: string | null;
  }): string {
    switch (element.type) {
      case ElementType.Folder:
        return 'folder';
      case ElementType.Item:
        return 'description';
      case ElementType.Worldbuilding:
        // Look up icon from schema using schemaId
        if (element.schemaId) {
          const project = this.projectState.project();
          if (project) {
            return this.worldbuildingService.getIconForType(
              element.schemaId,
              project.username,
              project.slug
            );
          }
        }
        return 'auto_awesome';
      default:
        return 'article';
    }
  }

  /** Move item up in list (for keyboard accessibility) */
  moveItemUp(index: number): void {
    if (index <= 0) return;
    const plan = this.localPlan();
    if (!plan) return;

    const items = [...plan.items];
    moveItemInArray(items, index, index - 1);
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
  }

  /** Move item down in list (for keyboard accessibility) */
  moveItemDown(index: number): void {
    const plan = this.localPlan();
    if (!plan) return;
    if (index >= plan.items.length - 1) return;

    const items = [...plan.items];
    moveItemInArray(items, index, index + 1);
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
  }

  addElement(elementId: string): void {
    const plan = this.localPlan();
    if (!plan) return;

    const newItem: ElementItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Element,
      elementId,
      includeChildren: false,
      isChapter: true,
    };

    const items = [...plan.items, newItem];
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
    this.showAddItemMenu.set(false);
  }

  addFrontmatter(contentType: FrontmatterType): void {
    const plan = this.localPlan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Frontmatter,
      contentType,
    };

    const items = [...plan.items, newItem];
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
    this.showAddItemMenu.set(false);
  }

  addBackmatter(contentType: BackmatterType): void {
    const plan = this.localPlan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Backmatter,
      contentType,
    };

    const items = [...plan.items, newItem];
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
    this.showAddItemMenu.set(false);
  }

  addSeparator(style: SeparatorStyle): void {
    const plan = this.localPlan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Separator,
      style,
    };

    const items = [...plan.items, newItem];
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
    this.showAddItemMenu.set(false);
  }

  addTableOfContents(): void {
    const plan = this.localPlan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.TableOfContents,
      title: 'Contents',
      depth: 2,
      includePageNumbers: false,
    };

    const items = [...plan.items, newItem];
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
    this.showAddItemMenu.set(false);
  }

  removeItem(itemId: string): void {
    const plan = this.localPlan();
    if (!plan) return;

    const items = plan.items.filter(item => item.id !== itemId);
    this.localPlan.set({ ...plan, items });
    this.hasChanges.set(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Item Display
  // ─────────────────────────────────────────────────────────────────────────────

  getItemLabel(item: PublishPlanItem): string {
    switch (item.type) {
      case PublishPlanItemType.Element: {
        const element = this.elements().find(e => e.id === item.elementId);
        return element?.name ?? 'Unknown Element';
      }
      case PublishPlanItemType.Frontmatter:
        return `Frontmatter: ${this.formatEnumLabel(item.contentType)}`;
      case PublishPlanItemType.Backmatter:
        return `Backmatter: ${this.formatEnumLabel(item.contentType)}`;
      case PublishPlanItemType.Separator:
        return `Separator: ${this.formatEnumLabel(item.style)}`;
      case PublishPlanItemType.TableOfContents:
        return `Table of Contents`;
      case PublishPlanItemType.Worldbuilding:
        return `Worldbuilding: ${item.title}`;
      default:
        return 'Unknown Item';
    }
  }

  getItemIcon(item: PublishPlanItem): string {
    switch (item.type) {
      case PublishPlanItemType.Element:
        return 'description';
      case PublishPlanItemType.Frontmatter:
        return 'first_page';
      case PublishPlanItemType.Backmatter:
        return 'last_page';
      case PublishPlanItemType.Separator:
        return 'horizontal_rule';
      case PublishPlanItemType.TableOfContents:
        return 'list';
      case PublishPlanItemType.Worldbuilding:
        return 'public';
      default:
        return 'help';
    }
  }

  formatEnumLabel(value: string): string {
    return value
      .replace(/-/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /** Get friendly display name for format */
  getFormatDisplayName(format: PublishFormat): string {
    const names: Record<PublishFormat, string> = {
      [PublishFormat.EPUB]: 'EPUB (E-Book)',
      [PublishFormat.PDF_SIMPLE]: 'PDF',
      [PublishFormat.HTML]: 'HTML',
      [PublishFormat.MARKDOWN]: 'Markdown',
    };
    return names[format] || format;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Save / Cancel
  // ─────────────────────────────────────────────────────────────────────────────

  saveChanges(): void {
    const plan = this.localPlan();
    if (!plan || !this.hasChanges()) return;

    this.projectState.updatePublishPlan(plan);
    this.hasChanges.set(false);
  }

  discardChanges(): void {
    const originalPlan = this.plan();
    if (originalPlan) {
      this.localPlan.set({ ...originalPlan });
    }
    this.hasChanges.set(false);
  }

  /** Track if generation is in progress */
  protected isGenerating = signal(false);

  async generatePublication(): Promise<void> {
    const plan = this.workingPlan();
    if (!plan || plan.items.length === 0) return;

    // Save any pending changes first
    if (this.hasChanges()) {
      this.saveChanges();
    }

    // Prevent double-click
    if (this.isGenerating()) return;
    this.isGenerating.set(true);

    try {
      // Show starting message
      this.snackBar.open(`Generating ${plan.format}...`, undefined, {
        duration: 2000,
      });

      // Call the publish service with skipDownload so dialog can handle it
      const result: PublishingResult = await this.publishService.publish(
        plan.id,
        {
          skipDownload: true, // Let dialog handle download
        }
      );

      // Extract typed values for type narrowing
      const savedFile: PublishedFile | undefined = result.savedFile;
      const blob: Blob | undefined = result.blob;

      if (result.success && savedFile && blob) {
        // Show completion dialog
        const currentProject = this.projectState.project();
        if (!currentProject) {
          throw new Error('No active project');
        }
        const projectKey = `${currentProject.username}/${currentProject.slug}`;

        const dialogData: PublishCompleteDialogData = {
          file: savedFile,
          projectKey,
          blob,
        };

        const dialogRef = this.dialog.open<
          PublishCompleteDialogComponent,
          PublishCompleteDialogData,
          PublishCompleteDialogResult
        >(PublishCompleteDialogComponent, {
          data: dialogData,
          width: '480px',
          disableClose: false,
        });

        const dialogResult = await firstValueFrom(dialogRef.afterClosed());

        // Handle dialog action
        if (dialogResult?.action === 'view-files') {
          // Navigate to published files tab
          const parts = projectKey.split('/');
          void this.router.navigate([
            '/project',
            parts[0],
            parts[1],
            'tab',
            'published-files',
          ]);
        }
      } else if (result.success) {
        // Success but no savedFile (saveFile option was false)
        const stats = result.stats;
        const message = stats
          ? `${plan.format} generated: ${stats.wordCount.toLocaleString()} words, ${stats.chapterCount} chapters`
          : `${plan.format} generated successfully!`;
        this.snackBar.open(message, 'OK', { duration: 5000 });
      } else if (result.cancelled) {
        this.snackBar.open('Generation cancelled', undefined, {
          duration: 3000,
        });
      } else {
        this.snackBar.open(`Error: ${result.error}`, 'Dismiss', {
          duration: 10000,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.snackBar.open(`Error: ${message}`, 'Dismiss', { duration: 10000 });
    } finally {
      this.isGenerating.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Section Toggles
  // ─────────────────────────────────────────────────────────────────────────────

  toggleMetadata(): void {
    this.metadataExpanded.update(v => !v);
  }

  toggleOptions(): void {
    this.optionsExpanded.update(v => !v);
  }

  toggleItems(): void {
    this.itemsExpanded.update(v => !v);
  }

  toggleAddItemMenu(): void {
    this.showAddItemMenu.update(v => !v);
  }
}
