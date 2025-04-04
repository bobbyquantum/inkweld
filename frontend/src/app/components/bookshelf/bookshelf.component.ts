import { CdkDrag, CdkDragEnd, CdkDropList } from '@angular/cdk/drag-drop';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { ProjectDto } from '@inkweld/index';

@Component({
  selector: 'app-bookshelf',
  standalone: true,
  imports: [ProjectCardComponent, MatIconModule, MatButtonModule, CdkDrag],
  templateUrl: './bookshelf.component.html',
  styleUrls: ['./bookshelf.component.scss'],
})
export class BookshelfComponent implements AfterViewInit, OnDestroy {
  @Input() projects: ProjectDto[] = [];
  @Output() projectSelected = new EventEmitter<ProjectDto>();

  // For carousel drag scrolling
  @ViewChild('projectsGrid') projectsGrid?: ElementRef<HTMLElement>;
  @ViewChild(CdkDropList) dropList?: CdkDropList;

  protected activeCardIndex = signal(-1);

  // Flags and handlers
  private recentlyDragged = false;
  private scrollTimeout: number | null = null;
  private dragTargetIndex = -1; // Store the drag target index
  private isDragging = false;
  private startX = 0;
  private lastX = 0;
  private dragStartActiveIndex = -1; // Store the active index when drag starts
  private dragPosition = { x: 0, y: 0 }; // Track drag position to prevent jumps
  private dragUpdateTimeout: number | null = null;
  private wheelHandler = (e: WheelEvent) => this.handleWheel(e);
  private scrollHandler = () => this.handleScroll();

  // Handle drag events
  onDragStarted() {
    if (this.projectsGrid?.nativeElement) {
      console.log('[BookshelfComponent] Drag started');

      // Add dragging class
      const grid = this.projectsGrid.nativeElement;
      grid.classList.add('dragging');

      // Reset drag target index at start of new drag
      this.dragTargetIndex = -1;

      // IMPORTANT: We need to handle the CDK drag's transform while preserving
      // our absolute positioning of cards. The best approach is to capture the
      // current state but not modify anything until drag ends.

      // Store current active card for reference during drag
      this.dragStartActiveIndex = this.activeCardIndex();
      console.log(
        `[BookshelfComponent] Starting drag with active index: ${this.dragStartActiveIndex}`
      );
    }
  }

  onDragEnded(event: CdkDragEnd) {
    if (!this.projectsGrid?.nativeElement) return;

    console.log('[BookshelfComponent] Drag ended');
    const grid = this.projectsGrid.nativeElement;
    grid.classList.remove('dragging');

    // Capture the grid element reference outside the setTimeout
    // to ensure TypeScript knows it's defined

    // Wait a bit for drag momentum to settle
    setTimeout(() => {
      if (!this.projectsGrid?.nativeElement) return;
      event.source.reset();
      // Clear ALL transforms from drag
      grid.style.transform = '';
      grid.style.webkitTransform = '';

      // Force a reflow to ensure transform is actually cleared
      void grid.offsetWidth;

      // Get the current drag target if available
      if (this.dragTargetIndex === -1) {
        // If not set during drag, find it now
        this.dragTargetIndex = this.findCenterCardIndex();
      }

      console.log(
        `[BookshelfComponent] Drag ended with target index: ${this.dragTargetIndex}`
      );

      // Always snap to the dragged-to position
      if (this.dragTargetIndex >= 0) {
        console.log(
          `[BookshelfComponent] Using dragTargetIndex: ${this.dragTargetIndex}`
        );
        this.scrollToCard(this.dragTargetIndex);
      } else {
        // Fallback to original position
        console.log(
          `[BookshelfComponent] Falling back to original position: ${this.dragStartActiveIndex}`
        );
        this.scrollToCard(this.dragStartActiveIndex);
      }

      // Reset the drag position and drag state
      this.dragPosition = { x: 0, y: 0 };
    }, 50);

    // Set flag to prevent click events right after drag
    this.recentlyDragged = true;
    setTimeout(() => {
      this.recentlyDragged = false;
    }, 300); // Clear flag after 300ms
  }

  onDragDropped() {
    // We're just using the drag/drop for the drag gesture
    // Not actually rearranging items
  }

  // Update card selection during drag
  onDragMoved() {
    // Debounce the update to avoid excessive calculations
    if (!this.dragUpdateTimeout) {
      this.dragUpdateTimeout = window.setTimeout(() => {
        // Find the center card but don't reposition - just update visuals
        const centerIndex = this.findCenterCardIndex();

        // Store this index for use when drag ends
        this.dragTargetIndex = centerIndex;

        // IMPORTANT: The fix is to update the activeCardIndex to match
        // the card that's currently being dragged to
        this.activeCardIndex.set(centerIndex);

        console.log(
          `[BookshelfComponent] Storing drag target index: ${centerIndex}`
        );

        if (centerIndex !== this.activeCardIndex()) {
          console.log(
            `[BookshelfComponent] During drag - new center card: ${centerIndex}`
          );
          this.updateCardVisuals(centerIndex);
        }

        this.dragUpdateTimeout = null;
      }, 50);
    }
  }

  // Update card visuals without repositioning
  private updateCardVisuals(centerIndex: number) {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (centerIndex >= 0 && centerIndex < cards.length) {
      // Update active index
      this.activeCardIndex.set(centerIndex);

      // Update visual styles without changing positions
      cards.forEach((card, i) => {
        const element = card as HTMLElement;

        // Update z-index and opacity
        const distance = Math.abs(i - centerIndex);
        element.style.zIndex =
          i === centerIndex ? '40' : (10 - distance).toString();
        element.style.opacity =
          distance === 0 ? '1' : distance === 1 ? '0.8' : '0.5';

        // Apply/remove centered class
        if (i === centerIndex) {
          element.classList.add('centered');
          element.style.transform = 'translateX(-50%) scale(1.1)';
        } else {
          element.classList.remove('centered');
          element.style.transform = 'translateX(-50%)';
        }
      });
    }
  }

  // Helper functions for carousel centering
  updateCenteredItem() {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (cards.length === 0) return;

    // Find the most visible card
    const centerIndex = this.findCenterCardIndex();

    if (centerIndex >= 0 && centerIndex < cards.length) {
      // Remove centered class from all cards
      cards.forEach(card => {
        (card as HTMLElement).classList.remove('centered');
      });

      // Add centered class to the center card
      (cards[centerIndex] as HTMLElement).classList.add('centered');

      // Update active index signal to trigger UI changes
      this.activeCardIndex.set(centerIndex);
    }
  }

  // After drag ends, find the nearest card and smoothly center it
  snapToNearestCard() {
    console.log(
      '[BookshelfComponent] snapToNearestCard called - using new positioning approach'
    );

    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;

    // First cancel all CdkDrag transforms which affect positioning
    grid.style.transform = '';
    grid.style.webkitTransform = '';

    // Force a browser reflow to ensure the transform is cleared
    void grid.offsetWidth;

    // Important: Get current drag state BEFORE applying any changes
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    // CRITICAL FIX: Use findCenterCardIndex() but store the result in a local variable
    // This ensures we get the card that's closest to the center after dragging
    const centerIndex = this.findCenterCardIndex();

    console.log(`[BookshelfComponent] Closest card after drag: ${centerIndex}`);

    // Apply transitions for smooth movement
    cards.forEach(card => {
      const element = card as HTMLElement;
      element.style.transition =
        'left 0.35s ease-out, transform 0.35s ease-out';
    });

    // Use our absolute positioning to properly align cards
    console.log(
      `[BookshelfComponent] Centering card ${centerIndex} after drag`
    );

    // CRITICAL FIX: Set the active card index BEFORE calling scrollToCard
    // This ensures the correct card is selected after drag
    this.activeCardIndex.set(centerIndex);

    // This will position the cards with the new selected card in the center
    this.scrollToCard(centerIndex);

    // Remove the transition after animation completes
    setTimeout(() => {
      cards.forEach(card => {
        const element = card as HTMLElement;
        element.style.transition = '';
      });

      // Reset the drag target index to avoid affecting future operations
      this.dragTargetIndex = -1;
      console.log('[BookshelfComponent] Reset drag target index');
    }, 350); // Slightly longer than the transition duration
  }

  findCenterCardIndex(): number {
    if (!this.projectsGrid?.nativeElement) return -1;

    // Use the center-selector element as the reference point
    const centerSelector = document.querySelector('.center-selector');
    let centerX = window.innerWidth / 2; // Default to middle of viewport

    if (centerSelector) {
      // Use the actual center selector position if available
      const centerRect = centerSelector.getBoundingClientRect();
      // Use the center, not the left edge of the center selector
      centerX = centerRect.left + centerRect.width / 2;
      console.log('[BookshelfComponent] Center selector position:', {
        left: centerRect.left,
        width: centerRect.width,
        calculatedCenter: centerX,
      });
    }

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (cards.length === 0) return -1;

    let closestCardIndex = 0;
    let closestDistance = Infinity;

    // Find the closest card to the center
    console.log('[BookshelfComponent] Card positions:');
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      const cardRect = card.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenterX - centerX);

      console.log(`Card ${i}: center=${cardCenterX}, distance=${distance}`);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestCardIndex = i;
      }
    }

    console.log(
      `[BookshelfComponent] Closest card: ${closestCardIndex} (distance: ${closestDistance}px)`
    );
    return closestCardIndex;
  }

  scrollToCard(index: number) {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (index >= 0 && index < cards.length) {
      console.log(`[BookshelfComponent] Selecting card ${index}`);

      // Clear any lingering transforms or transitions from previous operations
      cards.forEach(card => {
        const element = card as HTMLElement;
        element.style.transition = ''; // Clear transitions before setting new positions
      });

      // Only update the active index if it wasn't set by snapToNearestCard
      // This prevents the "snap back to first card" issue after dragging
      if (this.activeCardIndex() !== index) {
        this.activeCardIndex.set(index);
      }

      // Brief pause to ensure transitions are cleared
      void grid.offsetWidth;

      // Card dimensions
      const CARD_WIDTH = 350;
      const CARD_GAP = 120;

      // Get viewport dimensions for absolute positioning
      const viewportWidth = window.innerWidth;
      const viewportCenter = viewportWidth / 2;
      console.log(`[BookshelfComponent] Using absolute positioning strategy`);
      console.log(
        `[BookshelfComponent] Viewport width: ${viewportWidth}px, center: ${viewportCenter}px`
      );

      // Position all cards based on absolute coordinates
      cards.forEach((card, i) => {
        const element = card as HTMLElement;

        // Calculate the position relative to viewport center
        const position = viewportCenter + (i - index) * (CARD_WIDTH + CARD_GAP);

        // Log positioning info for debugging
        if (i === 0 || i === index) {
          console.log(
            `[BookshelfComponent] Card ${i} position: ${position}px (${i === index ? 'SELECTED' : ''})`
          );
        }

        // Set absolute left position instead of transform
        element.style.left = `${position}px`;
        element.style.transform =
          i === index ? 'translateX(-50%) scale(1.1)' : 'translateX(-50%)';

        // Set z-index to have selected card on top
        const distance = Math.abs(i - index);
        element.style.zIndex = i === index ? '40' : (10 - distance).toString();

        // Apply visual effects based on distance from selected
        element.style.opacity =
          distance === 0 ? '1' : distance === 1 ? '0.8' : '0.5';

        // Toggle centered class
        if (i === index) {
          element.classList.add('centered');
        } else {
          element.classList.remove('centered');
        }
      });

      console.log(`[BookshelfComponent] Card ${index} now centered`);

      // Add initialized class to make carousel visible after positioning
      if (!grid.classList.contains('initialized')) {
        setTimeout(() => {
          grid.classList.add('initialized');
          console.log('[BookshelfComponent] Carousel initialized and visible');
        }, 50); // Small delay to ensure positioning is complete
      }
    }
  }

  scrollToNext() {
    const currentIndex = this.activeCardIndex();
    const projectCount = this.projects.length;
    console.log(
      `[BookshelfComponent] scrollToNext called. Current: ${currentIndex}, Count: ${projectCount}`
    );

    // Only scroll if we're not at the last card
    if (currentIndex < projectCount - 1) {
      this.scrollToCard(currentIndex + 1);
    } else {
      // Reached the end, add a small bump animation
      console.log(
        '[BookshelfComponent] scrollToNext - Reached end, adding bump animation'
      );
      this.addBumpAnimation('right');
    }
  }

  scrollToPrevious() {
    const currentIndex = this.activeCardIndex();
    const projectCount = this.projects.length;
    console.log(
      `[BookshelfComponent] scrollToPrevious called. Current: ${currentIndex}, Count: ${projectCount}`
    );

    // Only scroll if we're not at the first card
    if (currentIndex > 0) {
      this.scrollToCard(currentIndex - 1);
    } else {
      // Reached the beginning, add a small bump animation
      console.log(
        '[BookshelfComponent] scrollToPrevious - Reached beginning, adding bump animation'
      );
      this.addBumpAnimation('left');
    }
  }

  private addBumpAnimation(direction: 'left' | 'right') {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const distance = direction === 'left' ? 20 : -20; // Pixels to bump

    // Reset any existing transform first
    grid.style.transition = 'none';
    grid.style.transform = '';
    void grid.offsetWidth; // Force reflow

    // Apply the bump
    grid.style.transition = 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)';
    grid.style.transform = `translateX(${distance}px)`;

    // Reset after the bump
    setTimeout(() => {
      grid.style.transition =
        'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
      grid.style.transform = '';
    }, 150);
  }

  private handleScroll() {
    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
    }
    this.scrollTimeout = window.setTimeout(() => {
      this.updateCenteredItem();
      this.scrollTimeout = null;
    }, 100);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Using arrow keys for navigation
    if (event.key === 'ArrowLeft') {
      this.scrollToPrevious();
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this.scrollToNext();
      event.preventDefault();
    }
  }

  private handleWheel(e: WheelEvent) {
    if (e.deltaX === 0) return; // Ignore vertical scrolling

    e.preventDefault();
    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
    }

    this.scrollTimeout = window.setTimeout(() => {
      if (e.deltaX > 50) {
        this.scrollToNext();
      } else if (e.deltaX < -50) {
        this.scrollToPrevious();
      }
      this.scrollTimeout = null;
    }, 100);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      if (!this.projectsGrid?.nativeElement) return;

      const gridElement = this.projectsGrid.nativeElement;

      // Add wheel event listener for desktop
      gridElement.addEventListener('wheel', this.wheelHandler, {
        passive: false,
      });

      // Initialize the carousel with the first card centered
      if (this.projects.length > 0) {
        console.log('[BookshelfComponent] Initializing carousel');
        this.scrollToCard(0);

        // Delay initialization slightly to ensure proper positioning
        setTimeout(() => {
          gridElement.classList.add('initialized');
          console.log('[BookshelfComponent] Carousel initialized');
        }, 200);
      }
    }, 100);
  }

  selectProject(project: ProjectDto) {
    if (this.recentlyDragged) {
      console.log('[BookshelfComponent] Ignoring click after drag');
      return;
    }
    this.projectSelected.emit(project);
  }

  ngOnDestroy() {
    // Clean up event listeners
    if (this.projectsGrid?.nativeElement) {
      this.projectsGrid.nativeElement.removeEventListener(
        'wheel',
        this.wheelHandler
      );
    }

    // Clear any pending timeouts
    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
    }
    if (this.dragUpdateTimeout) {
      window.clearTimeout(this.dragUpdateTimeout);
    }
  }
}
