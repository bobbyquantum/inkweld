import {
  type AfterViewInit,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  input,
  NgZone,
  type OnDestroy,
  Output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { type Project } from '@inkweld/index';
import { SyncQueueService, SyncStage } from '@services/sync/sync-queue.service';

import { ProjectCoverComponent } from '../project-cover/project-cover.component';

/** Long-press threshold in milliseconds */
const LONG_PRESS_MS = 500;
/** Pointer move threshold in pixels before cancelling long-press */
const MOVE_THRESHOLD = 10;

@Component({
  selector: 'app-project-card',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterModule,
    ProjectCoverComponent,
  ],
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.scss',
})
export class ProjectCardComponent implements AfterViewInit, OnDestroy {
  private readonly syncQueueService = inject(SyncQueueService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  @Input()
  public project!: Project;

  /** When true, shows a shared indicator badge on the card */
  @Input()
  public isShared = false;

  /** The owner's username for shared projects */
  @Input()
  public sharedByUsername?: string;

  /** Whether this project is activated on this device */
  @Input()
  public isActivated = true;

  /** Emitted on long-press (~500ms hold) */
  @Output()
  public longPress = new EventEmitter<void>();

  /** Project key for looking up sync status */
  readonly projectKey = input<string>();

  // Long-press tracking
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressFired = false;
  private startX = 0;
  private startY = 0;
  private activePointerId: number | null = null;

  // Bound handlers for cleanup
  private readonly boundPointerDown = this.onPointerDown.bind(this);
  private readonly boundPointerUp = this.onPointerUp.bind(this);
  private readonly boundPointerMove = this.onPointerMove.bind(this);
  private readonly boundPointerCancel = this.onPointerCancel.bind(this);
  private listenersAttached = false;

  /**
   * Attach long-press listeners. Called once the component initializes.
   * Runs outside Angular zone for performance.
   */
  ngAfterViewInit(): void {
    this.attachLongPressListeners();
  }

  private attachLongPressListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    const el = this.el.nativeElement;
    this.zone.runOutsideAngular(() => {
      el.addEventListener('pointerdown', this.boundPointerDown);
      el.addEventListener('pointerup', this.boundPointerUp);
      el.addEventListener('pointermove', this.boundPointerMove);
      el.addEventListener('pointercancel', this.boundPointerCancel);
    });
  }

  ngOnDestroy(): void {
    this.cancelLongPress();
    if (this.listenersAttached) {
      const el = this.el.nativeElement;
      el.removeEventListener('pointerdown', this.boundPointerDown);
      el.removeEventListener('pointerup', this.boundPointerUp);
      el.removeEventListener('pointermove', this.boundPointerMove);
      el.removeEventListener('pointercancel', this.boundPointerCancel);
    }
  }

  /** Whether the last interaction was a long-press (to suppress click) */
  wasLongPress(): boolean {
    return this.longPressFired;
  }

  private onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    this.activePointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.longPressFired = false;

    this.longPressTimer = setTimeout(() => {
      this.longPressFired = true;
      this.zone.run(() => this.longPress.emit());
    }, LONG_PRESS_MS);
  }

  private onPointerUp(event: PointerEvent): void {
    if (
      this.activePointerId !== null &&
      event.pointerId !== this.activePointerId
    )
      return;
    this.activePointerId = null;
    this.cancelLongPress();
  }

  private onPointerMove(event: PointerEvent): void {
    if (
      this.activePointerId !== null &&
      event.pointerId !== this.activePointerId
    )
      return;
    if (!this.longPressTimer) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      this.cancelLongPress();
    }
  }

  private onPointerCancel(): void {
    this.activePointerId = null;
    this.cancelLongPress();
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /** Current sync status for this project */
  readonly syncStatus = computed(() => {
    // Read statusVersion to trigger re-evaluation when statuses change
    this.syncQueueService.statusVersion();
    const key = this.projectKey();
    if (!key) return null;
    const statusSignal = this.syncQueueService.getProjectStatus(key);
    return statusSignal?.() ?? null;
  });

  /** Whether this project is currently syncing */
  readonly isSyncing = computed(() => {
    const status = this.syncStatus();
    if (!status) return false;
    return (
      status.stage !== SyncStage.Queued &&
      status.stage !== SyncStage.Completed &&
      status.stage !== SyncStage.Failed
    );
  });

  /** Whether this project is queued for sync */
  readonly isQueued = computed(() => {
    const status = this.syncStatus();
    return status?.stage === SyncStage.Queued;
  });

  /** Whether sync completed successfully */
  readonly isSynced = computed(() => {
    const status = this.syncStatus();
    return status?.stage === SyncStage.Completed;
  });

  /** Whether sync failed */
  readonly hasFailed = computed(() => {
    const status = this.syncStatus();
    return status?.stage === SyncStage.Failed;
  });

  /** User-friendly label for current sync stage */
  readonly syncStageLabel = computed(() => {
    const status = this.syncStatus();
    if (!status) return '';

    switch (status.stage) {
      case SyncStage.Queued:
        return 'Waiting...';
      case SyncStage.Metadata:
        return 'Syncing metadata...';
      case SyncStage.Elements:
        return 'Syncing structure...';
      case SyncStage.Documents:
        return 'Syncing documents...';
      case SyncStage.Media:
        return 'Syncing media...';
      case SyncStage.Worldbuilding:
        return 'Syncing worldbuilding...';
      case SyncStage.Completed:
        return 'Synced!';
      case SyncStage.Failed:
        return status.error ?? 'Sync failed';
      default:
        return '';
    }
  });
}
