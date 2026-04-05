import {
  type CdkDrag,
  type CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  type OnDestroy,
  type OnInit,
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
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { ElementType } from '@inkweld/index';
import { firstValueFrom, type Subscription } from 'rxjs';

import { ProjectCoverComponent } from '../../../../components/project-cover/project-cover.component';
import { PublishPreviewComponent } from '../../../../components/publish-preview/publish-preview.component';
import {
  PublishCompleteDialogComponent,
  type PublishCompleteDialogData,
  type PublishCompleteDialogResult,
} from '../../../../dialogs/publish-complete-dialog/publish-complete-dialog.component';
import {
  BackmatterType,
  ChapterNumbering,
  type ElementItem,
  FrontmatterType,
  PublishFormat,
  type PublishPlan,
  type PublishPlanItem,
  PublishPlanItemType,
  SeparatorStyle,
} from '../../../../models/publish-plan';
import { type PublishedFile } from '../../../../models/published-file';
import { FileSizePipe } from '../../../../pipes/file-size.pipe';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import {
  type PublishingResult,
  PublishService,
} from '../../../../services/publish/publish.service';
import { PublishedFilesService } from '../../../../services/publish/published-files.service';
import { WorldbuildingService } from '../../../../services/worldbuilding/worldbuilding.service';

type PlanSection =
  | 'metadata'
  | 'contents'
  | 'formatting'
  | 'publish'
  | 'preview';

@Component({
  selector: 'app-publish-plan-tab',
  templateUrl: './publish-plan-tab.component.html',
  styleUrls: ['./publish-plan-tab.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    ProjectCoverComponent,
    PublishPreviewComponent,
    DatePipe,
    FileSizePipe,
  ],
})
export class PublishPlanTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  protected projectState = inject(ProjectStateService);
  private readonly publishService = inject(PublishService);
  private readonly publishedFilesService = inject(PublishedFilesService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private paramSubscription: Subscription | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeCleanup: (() => void) | null = null;

  /** Expose ElementType for template */
  protected readonly ElementType = ElementType;

  /** The plan ID from route params */
  protected planId = signal<string>('');

  /** The current plan from state (source of truth) */
  protected plan = computed((): PublishPlan | null => {
    const id = this.planId();
    if (!id) return null;
    return this.projectState.getPublishPlan(id) ?? null;
  });

  /** Whether the preview is outdated (plan changed since last preview) */
  protected previewOutdated = signal(false);

  /** Currently selected section in sidenav/accordion */
  protected selectedSection = signal<PlanSection>('metadata');

  /** Whether to use sidenav layout (desktop) or accordion (mobile) */
  protected useSidenav = signal(true);

  /** Sidenav navigation items */
  protected readonly sections: {
    key: PlanSection;
    icon: string;
    label: string;
  }[] = [
    { key: 'metadata', icon: 'menu_book', label: 'Metadata' },
    { key: 'contents', icon: 'list', label: 'Contents' },
    { key: 'formatting', icon: 'tune', label: 'Formatting' },
    { key: 'preview', icon: 'visibility', label: 'Preview' },
    { key: 'publish', icon: 'publish', label: 'Publish' },
  ];

  /** Expandable sections (accordion mode) */
  protected metadataExpanded = signal(true);
  protected optionsExpanded = signal(false);
  protected itemsExpanded = signal(true);

  /** Show add item menu */
  protected showAddItemMenu = signal(false);

  /** Whether preview was auto-loaded */
  private previewAutoLoaded = false;

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

  /** Published files for this plan (filtered by planId, falling back to planName) */
  protected publishedFiles = signal<PublishedFile[]>([]);

  /** Subscription to published files observable */
  private publishedFilesSub: Subscription | null = null;

  constructor() {
    const browserWindow = globalThis.window;
    if (browserWindow) {
      const updateLayout = (): void => {
        this.useSidenav.set(browserWindow.innerWidth >= 760);
      };
      updateLayout();
      browserWindow.addEventListener('resize', updateLayout);
      this.resizeCleanup = () =>
        browserWindow.removeEventListener('resize', updateLayout);
    }

    // Reactively load published files when project becomes available (handles refresh)
    effect(() => {
      const project = this.projectState.project();
      if (project) {
        const projectKey = `${project.username}/${project.slug}`;
        void this.publishedFilesService.loadFiles(projectKey);
      }
    });
  }

  ngOnInit(): void {
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const newPlanId = params.get('tabId') || '';
      this.planId.set(newPlanId);
    });

    // Subscribe to published files and filter for this plan
    this.publishedFilesSub = this.publishedFilesService.files$.subscribe(
      files => {
        const plan = this.plan();
        if (!plan) {
          this.publishedFiles.set([]);
          return;
        }
        const filtered = files.filter(
          f => f.planId === plan.id || (!f.planId && f.planName === plan.name)
        );
        this.publishedFiles.set(filtered);
      }
    );
  }

  ngOnDestroy(): void {
    this.flushAutoSave();
    if (this.paramSubscription) {
      this.paramSubscription.unsubscribe();
      this.paramSubscription = null;
    }
    if (this.publishedFilesSub) {
      this.publishedFilesSub.unsubscribe();
      this.publishedFilesSub = null;
    }
    if (this.resizeCleanup) {
      this.resizeCleanup();
    }
  }

  /** Persist plan changes with debounce */
  private scheduleAutoSave(updatedPlan: PublishPlan): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(() => {
      this.projectState.updatePublishPlan(updatedPlan);
      this.autoSaveTimer = null;
    }, 500);
    this.previewOutdated.set(true);
  }

  /** Flush any pending auto-save immediately */
  private flushAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
      const plan = this.plan();
      if (plan) {
        this.projectState.updatePublishPlan(plan);
      }
    }
  }

  /** Helper: update plan in state and schedule auto-save */
  private updatePlan(changes: Partial<PublishPlan>): void {
    const plan = this.plan();
    if (!plan) return;
    const updated = { ...plan, ...changes };
    // Write to projectState immediately for reactive UI, debounce persistence
    this.projectState.updatePublishPlan(updated);
    this.previewOutdated.set(true);
    // Cancel any pending timer since we wrote directly
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Plan Name & Format
  // ─────────────────────────────────────────────────────────────────────────────

  updateName(event: Event): void {
    const plan = this.plan();
    if (!plan) return;
    const name = (event.target as HTMLInputElement).value;
    this.updatePlan({ name });
  }

  updateFormat(event: Event): void {
    const plan = this.plan();
    if (!plan) return;
    const format = (event.target as HTMLSelectElement).value as PublishFormat;
    this.updatePlan({ format });
  }

  /** Handle mat-select format change */
  updateFormatSelect(event: { value: PublishFormat }): void {
    const plan = this.plan();
    if (!plan) return;
    this.updatePlan({ format: event.value });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────────

  updateMetadata(field: string, event: Event): void {
    const plan = this.plan();
    if (!plan) return;
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement)
      .value;
    this.updatePlan({
      metadata: { ...plan.metadata, [field]: value },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Options
  // ─────────────────────────────────────────────────────────────────────────────

  updateOption(option: string, event: Event): void {
    const plan = this.plan();
    if (!plan) return;
    const target = event.target as HTMLInputElement;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.updatePlan({
      options: { ...plan.options, [option]: value },
    });
  }

  /** Handle mat-checkbox change */
  updateOptionCheckbox(option: string, event: { checked: boolean }): void {
    const plan = this.plan();
    if (!plan) return;
    this.updatePlan({
      options: { ...plan.options, [option]: event.checked },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Items Management
  // ─────────────────────────────────────────────────────────────────────────────

  dropItem(event: CdkDragDrop<PublishPlanItem[]>): void {
    const plan = this.plan();
    if (!plan) return;

    // Cross-list drop from project tree
    if (event.previousContainer !== event.container) {
      const node = event.item.data as { id?: string; type?: ElementType };
      if (node?.id && node?.type !== undefined) {
        this.addElement(node.id, event.currentIndex);
      }
      return;
    }

    const items = [...plan.items];
    moveItemInArray(items, event.previousIndex, event.currentIndex);

    this.updatePlan({ items });
  }

  /** Predicate: only allow non-folder elements to be dropped into the list */
  canEnterPublishList = (drag: CdkDrag): boolean => {
    const data = drag.data as { type?: ElementType } | undefined;
    return data?.type !== undefined && data.type !== ElementType.Folder;
  };

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
    const plan = this.plan();
    if (!plan) return;

    const items = [...plan.items];
    moveItemInArray(items, index, index - 1);
    this.updatePlan({ items });
  }

  /** Move item down in list (for keyboard accessibility) */
  moveItemDown(index: number): void {
    const plan = this.plan();
    if (!plan) return;
    if (index >= plan.items.length - 1) return;

    const items = [...plan.items];
    moveItemInArray(items, index, index + 1);
    this.updatePlan({ items });
  }

  addElement(elementId: string, index?: number): void {
    const plan = this.plan();
    if (!plan) return;

    const newItem: ElementItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Element,
      elementId,
      includeChildren: false,
      isChapter: true,
    };

    const items = [...plan.items];
    if (index !== undefined && index >= 0 && index <= items.length) {
      items.splice(index, 0, newItem);
    } else {
      items.push(newItem);
    }
    this.updatePlan({ items });
    this.showAddItemMenu.set(false);
  }

  addFrontmatter(contentType: FrontmatterType): void {
    const plan = this.plan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Frontmatter,
      contentType,
    };

    this.updatePlan({ items: [...plan.items, newItem] });
    this.showAddItemMenu.set(false);
  }

  addBackmatter(contentType: BackmatterType): void {
    const plan = this.plan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Backmatter,
      contentType,
    };

    this.updatePlan({ items: [...plan.items, newItem] });
    this.showAddItemMenu.set(false);
  }

  addSeparator(style: SeparatorStyle): void {
    const plan = this.plan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Separator,
      style,
    };

    this.updatePlan({ items: [...plan.items, newItem] });
    this.showAddItemMenu.set(false);
  }

  addTableOfContents(): void {
    const plan = this.plan();
    if (!plan) return;

    const newItem: PublishPlanItem = {
      id: crypto.randomUUID(),
      type: PublishPlanItemType.TableOfContents,
      title: 'Contents',
      depth: 2,
      includePageNumbers: false,
    };

    this.updatePlan({ items: [...plan.items, newItem] });
    this.showAddItemMenu.set(false);
  }

  /** Walk the element tree in order, adding all non-folder elements */
  addEverything(): void {
    const plan = this.plan();
    if (!plan) return;

    const newItems: PublishPlanItem[] = this.documentElements().map(
      element => ({
        id: crypto.randomUUID(),
        type: PublishPlanItemType.Element,
        elementId: element.id,
        includeChildren: false,
        isChapter: true,
      })
    );

    if (newItems.length > 0) {
      this.updatePlan({ items: [...plan.items, ...newItems] });
    }
  }

  removeItem(itemId: string): void {
    const plan = this.plan();
    if (!plan) return;

    const items = plan.items.filter(item => item.id !== itemId);
    this.updatePlan({ items });
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
      .replaceAll('-', ' ')
      .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
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
  // Section Navigation
  // ─────────────────────────────────────────────────────────────────────────────

  selectSection(section: PlanSection): void {
    this.selectedSection.set(section);
    if (section === 'preview') {
      this.previewAutoLoaded = true;
    }
  }

  /** Whether preview tab is currently shown */
  protected isPreviewSection(): boolean {
    return this.selectedSection() === 'preview';
  }

  /** Download a previously published file */
  async downloadPublishedFile(fileId: string): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;
    const projectKey = `${project.username}/${project.slug}`;
    try {
      await this.publishedFilesService.downloadFile(projectKey, fileId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Download failed';
      this.snackBar.open(msg, 'Dismiss', { duration: 5000 });
    }
  }

  /** Delete a published file */
  async deletePublishedFile(fileId: string): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;
    const projectKey = `${project.username}/${project.slug}`;
    try {
      await this.publishedFilesService.deleteFile(projectKey, fileId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Delete failed';
      this.snackBar.open(msg, 'Dismiss', { duration: 5000 });
    }
  }

  /** Get icon for a published format */
  getPublishedFormatIcon(format: string): string {
    switch (format as PublishFormat) {
      case PublishFormat.EPUB:
        return 'book';
      case PublishFormat.PDF_SIMPLE:
        return 'picture_as_pdf';
      case PublishFormat.HTML:
        return 'code';
      case PublishFormat.MARKDOWN:
        return 'description';
      default:
        return 'insert_drive_file';
    }
  }

  /** Track if generation is in progress */
  protected isGenerating = signal(false);

  async generatePublication(): Promise<void> {
    const plan = this.plan();
    if (!plan || plan.items.length === 0) return;

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

      this.handlePublishResult(result, plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.snackBar.open(`Error: ${message}`, 'Dismiss', { duration: 10000 });
    } finally {
      this.isGenerating.set(false);
    }
  }

  private handlePublishResult(
    result: PublishingResult,
    plan: { format: string; id: string }
  ): void {
    const savedFile: PublishedFile | undefined = result.savedFile;
    const blob: Blob | undefined = result.blob;

    if (result.success && savedFile && blob) {
      this.showPublishDialog(savedFile, blob);
    } else if (result.success) {
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
  }

  private showPublishDialog(savedFile: PublishedFile, blob: Blob): void {
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

    firstValueFrom(dialogRef.afterClosed())
      .then(dialogResult => {
        if (dialogResult?.action === 'view-files') {
          const parts = projectKey.split('/');
          return this.router.navigate([
            '/project',
            parts[0],
            parts[1],
            'tab',
            'published-files',
          ]);
        }
        return undefined;
      })
      .catch(() => {});
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
