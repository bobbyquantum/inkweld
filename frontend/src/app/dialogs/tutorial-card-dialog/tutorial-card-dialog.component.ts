import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  inject,
  type OnDestroy,
  type Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { computeCardPosition } from '@components/tutorial-overlay/tutorial-position';
import { TranslocoModule } from '@jsverse/transloco';
import { TutorialService } from '@services/core/tutorial.service';

/** Data handed to the step-card dialog by the tutorial overlay. */
export interface TutorialCardDialogData {
  /**
   * Live bounding rect of the current step's anchor; null renders the card
   * centered in the viewport.
   */
  anchorRect: Signal<DOMRect | null>;
}

/**
 * The step card of a guided tour, shown through MatDialog so the dialog
 * role, focus trapping and Escape handling come from the platform.
 *
 * The overlay resolves the step anchor and keeps its rect up to date (live
 * via {@link TutorialCardDialogData.anchorRect}); this component measures
 * itself and moves the dialog pane beside the anchor — below, above, inside
 * or beside it, always clamped to the viewport — or centers the pane for
 * anchor-less steps.
 */
@Component({
  selector: 'app-tutorial-card-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoModule],
  templateUrl: './tutorial-card-dialog.component.html',
  styleUrl: './tutorial-card-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class TutorialCardDialogComponent implements OnDestroy {
  protected readonly tutorial = inject(TutorialService);
  private readonly dialogRef = inject(
    MatDialogRef<TutorialCardDialogComponent>
  );
  private readonly data = inject<TutorialCardDialogData>(MAT_DIALOG_DATA);

  /** False while the card is being (re)measured, to avoid position flicker. */
  protected readonly cardReady = signal(false);

  private readonly cardElement =
    viewChild<ElementRef<HTMLElement>>('tutorialCard');

  private placementFrame: number | null = null;

  constructor() {
    // Re-place the card whenever the anchor moves (step change, scroll,
    // resize).
    effect(() => {
      const rect = this.data.anchorRect();
      untracked(() => this.scheduleCardPlacement(rect));
    });
  }

  ngOnDestroy(): void {
    this.cancelPlacementFrame();
  }

  protected isIntroStep(): boolean {
    return this.tutorial.stepIndex() === 0;
  }

  protected isLastStep(): boolean {
    return this.tutorial.stepIndex() >= this.tutorial.totalSteps() - 1;
  }

  private scheduleCardPlacement(rect: DOMRect | null): void {
    this.cancelPlacementFrame();
    this.placementFrame = requestAnimationFrame(() => {
      this.placementFrame = null;
      const card = this.cardElement()?.nativeElement;
      if (!card) {
        // Card not rendered yet — try again next frame.
        this.scheduleCardPlacement(rect);
        return;
      }
      if (rect) {
        const position = computeCardPosition(
          rect,
          { width: card.offsetWidth, height: card.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight }
        );
        this.dialogRef.updatePosition({
          top: `${position.top}px`,
          left: `${position.left}px`,
        });
      } else {
        // Anchor-less step: no offsets re-centers the pane.
        this.dialogRef.updatePosition();
      }
      this.cardReady.set(true);
      this.focusCard();
    });
  }

  private cancelPlacementFrame(): void {
    if (this.placementFrame !== null) {
      cancelAnimationFrame(this.placementFrame);
      this.placementFrame = null;
    }
  }

  /**
   * Move focus to the step's primary button once the card is visible. The
   * dialog's focus trap captures while the card is still hidden (unmeasured),
   * so its own initial focus attempt lands nowhere.
   */
  private focusCard(): void {
    const card = this.cardElement()?.nativeElement;
    if (!card || card.contains(document.activeElement)) {
      return;
    }
    card.querySelector<HTMLElement>('[cdkFocusInitial]')?.focus();
  }
}
