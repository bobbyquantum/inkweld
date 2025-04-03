import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  HostListener, // <-- Import HostListener
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterModule } from '@angular/router';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { NewProjectDialogComponent } from '@dialogs/new-project-dialog/new-project-dialog.component';
import { ProjectDto } from '@inkweld/index';
import { ProjectService } from '@services/project.service';
import { UserService } from '@services/user.service';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-home',
  imports: [
    UserMenuComponent,
    ProjectCardComponent,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    RouterModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    CdkDrag,
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  dialog = inject(MatDialog);
  protected router = inject(Router);
  protected userService = inject(UserService);
  protected projectService = inject(ProjectService);
  protected breakpointObserver = inject(BreakpointObserver);

  // Component state
  loadError = false;
  selectedProject: ProjectDto | null = null;
  isMobile = false;
  searchControl = new FormControl('');

  // For carousel drag scrolling
  @ViewChild('projectsGrid') projectsGrid?: ElementRef<HTMLElement>;
  @ViewChild(CdkDropList) dropList?: CdkDropList;

  protected user = this.userService.currentUser;
  protected isLoading = this.projectService.isLoading;
  protected destroy$ = new Subject<void>();
  protected activeCardIndex = signal(-1);

  // Flags and handlers
  private recentlyDragged = false;
  private scrollTimeout: number | null = null;
  private dragUpdateTimeout: number | null = null;
  private wheelHandler = (e: WheelEvent) => this.handleWheel(e);
  private scrollHandler = () => this.handleScroll();

  // Computed state
  protected filteredProjects = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) {
      return this.projectService.projects();
    }

    return this.projectService.projects().filter(project => {
      return (
        project.title.toLowerCase().includes(term) ||
        project.slug.toLowerCase().includes(term) ||
        project.description?.toLowerCase().includes(term) ||
        project.username.toLowerCase().includes(term)
      );
    });
  });

  // Private state
  private searchTerm = signal('');

  // Handle drag events
  onDragStarted() {
    if (this.projectsGrid?.nativeElement) {
      this.projectsGrid.nativeElement.classList.add('dragging');
    }
  }

  onDragEnded() {
    if (this.projectsGrid?.nativeElement) {
      console.log('[HomeComponent] Drag ended');
      this.projectsGrid.nativeElement.classList.remove('dragging');

      // Wait longer for drag momentum to settle
      setTimeout(() => {
        console.log(
          '[HomeComponent] Calling snapToNearestCard after drag delay'
        );
        this.snapToNearestCard();
      }, 150); // Increased from 50ms to 150ms

      // Set flag to prevent click events right after drag
      this.recentlyDragged = true;
      setTimeout(() => {
        this.recentlyDragged = false;
      }, 300); // Clear flag after 300ms
    }
  }

  onDragDropped() {
    // We're just using the drag/drop for the drag gesture
    // Not actually rearranging items
  }

  // No longer updating during drag
  onDragMoved() {
    // We're not using drag functionality anymore
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

  // Not using snap functionality
  snapToNearestCard() {
    console.log(
      '[HomeComponent] snapToNearestCard called - using new positioning approach'
    );
    // We don't need to find the center index, just keep the currently active one
    this.scrollToCard(this.activeCardIndex());
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
      console.log('[HomeComponent] Center selector position:', {
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
    console.log('[HomeComponent] Card positions:');
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
      `[HomeComponent] Closest card: ${closestCardIndex} (distance: ${closestDistance}px)`
    );
    return closestCardIndex;
  }

  scrollToCard(index: number) {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (index >= 0 && index < cards.length) {
      console.log(`[HomeComponent] Selecting card ${index}`);

      // First update the active index
      this.activeCardIndex.set(index);

      // Card dimensions
      const CARD_WIDTH = 350;
      const CARD_GAP = 120;

      // Get viewport dimensions for absolute positioning
      const viewportWidth = window.innerWidth;
      const viewportCenter = viewportWidth / 2;
      console.log(`[HomeComponent] Using absolute positioning strategy`);
      console.log(
        `[HomeComponent] Viewport width: ${viewportWidth}px, center: ${viewportCenter}px`
      );

      // Position all cards based on absolute coordinates
      cards.forEach((card, i) => {
        const element = card as HTMLElement;

        // Calculate the position relative to viewport center
        const position = viewportCenter + (i - index) * (CARD_WIDTH + CARD_GAP);

        // Log positioning info for debugging
        if (i === 0 || i === index) {
          console.log(
            `[HomeComponent] Card ${i} position: ${position}px (${i === index ? 'SELECTED' : ''})`
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

      console.log(`[HomeComponent] Card ${index} now centered`);

      // Add initialized class to make carousel visible after positioning
      if (!grid.classList.contains('initialized')) {
        setTimeout(() => {
          grid.classList.add('initialized');
          console.log('[HomeComponent] Carousel initialized and visible');
        }, 50); // Small delay to ensure positioning is complete
      }
    }
  }

  scrollToNext() {
    const currentIndex = this.activeCardIndex();
    const projectCount = this.filteredProjects().length;
    console.log(
      `[HomeComponent] scrollToNext called. Current: ${currentIndex}, Count: ${projectCount}`
    );

    // Only scroll if we're not at the last card
    if (currentIndex < projectCount - 1) {
      this.scrollToCard(currentIndex + 1);
    } else {
      // Reached the end, add a small bump animation
      console.log(
        '[HomeComponent] scrollToNext - Reached end, adding bump animation'
      );
      this.addBumpAnimation('right');
    }
  }

  scrollToPrevious() {
    const currentIndex = this.activeCardIndex();
    const projectCount = this.filteredProjects().length;
    console.log(
      `[HomeComponent] scrollToPrevious called. Current: ${currentIndex}, Count: ${projectCount}`
    );

    // Only scroll if we're not at the first card
    if (currentIndex > 0) {
      this.scrollToCard(currentIndex - 1);
    } else {
      // Reached the beginning, add a small bump animation
      console.log(
        '[HomeComponent] scrollToPrevious - Reached start, adding bump animation'
      );
      this.addBumpAnimation('left');
    }
  }

  // Add a small bump animation to show the user they've reached the end
  private addBumpAnimation(direction: 'left' | 'right') {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));
    const currentIndex = this.activeCardIndex();

    if (currentIndex >= 0 && currentIndex < cards.length) {
      const currentCard = cards[currentIndex] as HTMLElement;
      const originalPosition = currentCard.style.left;
      const bumpDistance = 15; // pixels

      // Quick bump in the direction of attempted movement
      const bumpOffset = direction === 'right' ? bumpDistance : -bumpDistance;

      // First bump out
      currentCard.style.transition = 'left 0.1s ease-in-out';
      currentCard.style.left = `calc(${originalPosition} + ${bumpOffset}px)`;

      // Then bounce back
      setTimeout(() => {
        currentCard.style.transition = 'left 0.2s ease-out';
        currentCard.style.left = originalPosition;

        // Remove transition after animation completes
        setTimeout(() => {
          currentCard.style.transition = '';
        }, 200);
      }, 100);
    }
  }

  private handleScroll() {
    // Debounce scroll events
    if (!this.scrollTimeout) {
      this.scrollTimeout = window.setTimeout(() => {
        this.updateCenteredItem();
        this.scrollTimeout = null;
      }, 100);
    }
  }

  // Add HostListener for keyboard navigation
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Check if the focus is inside the search input, if so, don't navigate
    if (
      event.target instanceof HTMLInputElement &&
      event.target.closest('.search-container')
    ) {
      return;
    }

    if (event.key === 'ArrowRight') {
      console.log('[HomeComponent] ArrowRight key pressed');
      event.preventDefault(); // Prevent default browser scroll if applicable
      this.scrollToNext();
    } else if (event.key === 'ArrowLeft') {
      console.log('[HomeComponent] ArrowLeft key pressed');
      event.preventDefault(); // Prevent default browser scroll if applicable
      this.scrollToPrevious();
    }
  }

  // Handle mouse wheel events for horizontal scrolling
  private handleWheel(e: WheelEvent) {
    // Always prevent default to ensure we control the scrolling
    e.preventDefault();

    // Use either vertical or horizontal delta, prioritizing vertical for mouse wheels
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

    // Debounce wheel events for smoother scrolling
    if (!this.scrollTimeout) {
      this.scrollTimeout = window.setTimeout(() => {
        if (Math.abs(delta) > 0) {
          if (delta > 0) {
            this.scrollToNext();
          } else {
            this.scrollToPrevious();
          }
        }
        this.scrollTimeout = null;
      }, 50);
    }
  }

  ngOnInit() {
    void this.loadProjects();
    this.setupBreakpointObserver();
    this.setupSearchObserver();
  }

  ngAfterViewInit() {
    // Using a timer to ensure the DOM is fully rendered before trying to access elements
    setTimeout(() => {
      if (this.projectsGrid?.nativeElement) {
        // Add log to confirm element exists
        console.log(
          '[HomeComponent] Found projectsGrid element, setting up display.'
        );

        // Add wheel event listener for horizontal scrolling with mouse wheel
        // We'll use this to trigger next/previous
        console.log(
          '[HomeComponent] Attaching wheel listener (passive: false)'
        );
        this.projectsGrid.nativeElement.addEventListener(
          'wheel',
          this.wheelHandler,
          { passive: false } // Required to use preventDefault
        );

        // Set up the initial display with a longer delay to ensure DOM is fully ready
        setTimeout(() => {
          console.log(
            '[HomeComponent] Running initial scrollToCard with delay'
          );
          this.scrollToCard(0); // Initialize with first card
        }, 800); // Increased from 500ms to 800ms for more reliable initial rendering
      } else {
        // Add log if element is NOT found
        console.error(
          '[HomeComponent] projectsGrid element NOT found in ngAfterViewInit!'
        );
      }
    }, 100); // Short delay to ensure the view is ready
  }

  setupSearchObserver() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(value => {
        this.searchTerm.set(value || '');
      });
  }

  async loadProjects() {
    this.loadError = false;
    try {
      await this.projectService.loadAllProjects();
    } catch (error) {
      this.loadError = true;
      console.error('Failed to load projects:', error);
    }
  }

  setupBreakpointObserver() {
    this.breakpointObserver
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile = result.matches;
      });
  }

  selectProject(project: ProjectDto) {
    // Prevent navigation if we just finished dragging
    if (this.recentlyDragged) {
      return;
    }

    // Navigate directly to the project instead of showing a preview
    void this.router.navigate([project.username || '', project.slug || '']);
  }

  backToList() {
    this.selectedProject = null;
  }

  openNewProjectDialog(): void {
    const dialogRef = this.dialog.open(NewProjectDialogComponent, {
      width: '500px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        void this.loadProjects();
      }
    });
  }

  ngOnDestroy() {
    // Remove event listeners
    if (this.projectsGrid?.nativeElement) {
      this.projectsGrid.nativeElement.removeEventListener(
        'scroll',
        this.scrollHandler
      );

      this.projectsGrid.nativeElement.removeEventListener(
        'wheel',
        this.wheelHandler
      );
    }

    // Clear any pending timeouts
    if (this.scrollTimeout !== null) {
      window.clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }

    if (this.dragUpdateTimeout !== null) {
      window.clearTimeout(this.dragUpdateTimeout);
      this.dragUpdateTimeout = null;
    }

    this.destroy$.next();
    this.destroy$.complete();
  }
}
