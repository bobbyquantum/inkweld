import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  effect,
  EffectRef,
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
import { Project } from '@inkweld/index';
import { debounce } from 'lodash-es';

@Component({
  selector: 'app-bookshelf',
  standalone: true,
  imports: [ProjectCardComponent, MatIconModule, MatButtonModule, CdkDrag],
  templateUrl: './bookshelf.component.html',
  styleUrls: ['./bookshelf.component.scss'],
})
export class BookshelfComponent
  implements AfterViewInit, OnDestroy, AfterViewChecked
{
  private _projects: Project[] = [];
  @Input()
  set projects(value: Project[]) {
    this._projects = value;
    this.needsRecalculation = true;
  }
  get projects(): Project[] {
    return this._projects;
  }
  @Output() projectSelected = new EventEmitter<Project>();

  // Effect reference for cleanup
  private projectsEffectRef?: EffectRef;

  @ViewChild('projectsGrid') projectsGrid?: ElementRef<HTMLElement>;

  protected activeCardIndex = signal(-1);

  // Set up effect in constructor (injection context)
  constructor() {
    this.projectsEffectRef = effect(() => {
      // Access projects to track changes
      void this._projects;
      // Just set the flag; actual recalculation will happen in ngAfterViewChecked
      this.needsRecalculation = true;
    });
  }

  private recentlyDragged = false;
  private recentlyScrolled = false;
  private dragTargetIndex = -1;
  private dragStartActiveIndex = -1;
  private wheelHandler = (e: WheelEvent) => this.handleWheel(e);

  // Dynamic card width
  private cardWidth: number = 350; // fallback default
  private cardGap: number = 20; // can be made dynamic if needed

  // Recalculation flag for view update
  private needsRecalculation = false;
  private isDestroyed = false;

  // Debounced functions
  private debouncedUpdateCenteredItem = debounce(this.updateCenteredItem, 100);
  private debouncedDragUpdate = debounce(() => {
    const centerIndex = this.findCenterCardIndex();
    this.dragTargetIndex = centerIndex;

    if (centerIndex !== this.activeCardIndex()) {
      this.activeCardIndex.set(centerIndex);
      this.updateCardVisuals(centerIndex);
    }
  }, 50);
  private debouncedWheelHandler = debounce((deltaX: number) => {
    if (deltaX > 50) {
      this.scrollToNext();
    } else if (deltaX < -50) {
      this.scrollToPrevious();
    }
  }, 100);

  onDragStarted() {
    if (this.projectsGrid?.nativeElement) {
      const grid = this.projectsGrid.nativeElement;
      grid.classList.add('dragging');
      this.dragTargetIndex = -1;
      this.dragStartActiveIndex = this.activeCardIndex();
    }
  }

  onDragEnded(event: CdkDragEnd) {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    grid.classList.remove('dragging');

    // Prevent any card transitions during the release handling
    grid.classList.add('no-transitions');

    // Find the center card index
    if (this.dragTargetIndex === -1) {
      this.dragTargetIndex = this.findCenterCardIndex();
    }

    // Store current visual positions of all cards before any changes
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    // Define type for the card position data
    interface CardPosition {
      leftPx: number;
      width: number;
    }

    const cardPositions = new Map<HTMLElement, CardPosition>();

    // Capture exact positions and store them in a map for quick access
    cards.forEach(card => {
      const element = card as HTMLElement;
      const rect = element.getBoundingClientRect();
      cardPositions.set(element, {
        leftPx: rect.left,
        width: rect.width,
      });
    });

    // We'll freeze all animations temporarily
    cards.forEach(card => {
      const element = card as HTMLElement;
      element.style.transition = 'none';
    });

    // Reset the drag source but maintain visual positions
    event.source.reset();

    // Prevent the browser from batching these style changes
    void grid.offsetWidth;

    // Important: Apply exact release positions immediately
    cards.forEach(card => {
      const element = card as HTMLElement;
      const pos = cardPositions.get(element);
      if (pos) {
        // Position each card exactly where it visually was at release
        element.style.left = `${pos.leftPx + pos.width / 2}px`;
      }
    });

    // Apply a class that will freeze everything during this critical time
    grid.classList.add('freeze-position');

    // Force layout recalculation to ensure positions are applied
    void grid.offsetWidth;

    // Now we can safely remove the no-transitions class and add transitioning
    setTimeout(() => {
      grid.classList.remove('no-transitions');
      grid.classList.add('transitioning');
      grid.classList.remove('freeze-position');

      // Now start the smooth animation to the final positions
      if (this.dragTargetIndex >= 0) {
        this.scrollToCard(this.dragTargetIndex, true);
      } else {
        this.scrollToCard(this.dragStartActiveIndex, true);
      }

      // Remove the transitioning class after animation completes
      setTimeout(() => {
        grid.classList.remove('transitioning');
      }, 10);
    }, 20); // Small delay to ensure browser renders the frozen positions first

    this.recentlyDragged = true;
    setTimeout(() => {
      this.recentlyDragged = false;
    }, 20);
  }

  onDragMoved() {
    // Find center card immediately to update visuals while dragging
    const centerIndex = this.findCenterCardIndex();
    this.updateCardVisuals(centerIndex);

    // Still use debounced update for state management
    this.debouncedDragUpdate();
  }

  private updateCardVisuals(centerIndex: number) {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (centerIndex >= 0 && centerIndex < cards.length) {
      this.activeCardIndex.set(centerIndex);

      cards.forEach((card, i) => {
        const element = card as HTMLElement;

        const distance = Math.abs(i - centerIndex);
        element.style.zIndex =
          i === centerIndex ? '40' : (10 - distance).toString();

        // Calculate opacity based on distance
        element.style.opacity =
          distance === 0 ? '1' : distance === 1 ? '0.8' : '0.5';

        const scale = distance === 0 ? 1 : distance === 1 ? 0.9 : 0.8;
        element.style.transform = `translateX(-50%) scale(${scale})`;

        if (i === centerIndex) {
          element.classList.add('centered');
        } else {
          element.classList.remove('centered');
        }
      });
    }
  }

  updateCenteredItem() {
    if (this.isDestroyed || !this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (cards.length === 0) return;

    const centerIndex = this.findCenterCardIndex();

    if (centerIndex >= 0 && centerIndex < cards.length) {
      cards.forEach(card => {
        (card as HTMLElement).classList.remove('centered');
      });

      (cards[centerIndex] as HTMLElement).classList.add('centered');
      this.activeCardIndex.set(centerIndex);
    }
  }

  findCenterCardIndex(): number {
    if (!this.projectsGrid?.nativeElement) return -1;

    // Use the local center-selector within this bookshelf instance
    const grid = this.projectsGrid.nativeElement;
    const container = grid.closest?.('.bookshelf-container');
    let centerX: number;

    if (container) {
      const centerSelector = container.querySelector('.center-selector');
      if (centerSelector) {
        const centerRect = (
          centerSelector as HTMLElement
        ).getBoundingClientRect();
        centerX = centerRect.left + centerRect.width / 2;
      } else {
        // fallback to container center
        const containerRect = container.getBoundingClientRect();
        centerX = containerRect.left + containerRect.width / 2;
      }
    } else {
      // fallback to viewport center
      centerX = window.innerWidth / 2;
    }

    const cardList = grid.querySelectorAll?.('.project-card-wrapper');
    if (!cardList) return -1;
    const cards = Array.from(cardList);

    if (cards.length === 0) return -1;

    let closestCardIndex = 0;
    let closestDistance = Infinity;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      const cardRect = card.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenterX - centerX);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestCardIndex = i;
      }
    }

    return closestCardIndex;
  }

  scrollToCard(index: number, smoothTransition = false) {
    if (this.isDestroyed || !this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (index >= 0 && index < cards.length) {
      if (this.activeCardIndex() !== index) {
        this.activeCardIndex.set(index);
      }

      void grid.offsetWidth;

      // Use dynamic card width and gap
      const CARD_WIDTH = this.cardWidth;
      const CARD_GAP = this.cardGap;

      const viewportWidth = window.innerWidth;
      const viewportCenter = viewportWidth / 2;

      cards.forEach((card, i) => {
        const element = card as HTMLElement;

        // Apply smoother transition when requested
        if (smoothTransition) {
          element.style.transition =
            'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), ' +
            'opacity 0.5s ease-in-out, ' +
            'left 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
        } else {
          // Use default transitions from CSS
          element.style.transition = '';
        }

        const position = viewportCenter + (i - index) * (CARD_WIDTH + CARD_GAP);

        // Apply position and scale
        element.style.left = `${position}px`;

        const distance = Math.abs(i - index);
        const scale = distance === 0 ? 1.0 : distance === 1 ? 0.9 : 0.8;

        element.style.transform = `translateX(-50%) scale(${scale})`;
        element.style.zIndex = i === index ? '40' : (10 - distance).toString();
        element.style.opacity =
          distance === 0 ? '1' : distance === 1 ? '0.8' : '0.5';

        if (i === index) {
          element.classList.add('centered');
        } else {
          element.classList.remove('centered');
        }
      });

      if (!grid.classList.contains('initialized')) {
        setTimeout(() => {
          grid.classList.add('initialized');
        }, 50);
      }
    }
  }

  scrollToNext() {
    if (this.isDestroyed) return;
    const currentIndex = this.activeCardIndex();
    const projectCount = this.projects.length;

    if (currentIndex < projectCount - 1) {
      this.scrollToCard(currentIndex + 1);
    } else {
      this.addBumpAnimation('right');
    }
  }

  scrollToPrevious() {
    if (this.isDestroyed) return;
    const currentIndex = this.activeCardIndex();

    if (currentIndex > 0) {
      this.scrollToCard(currentIndex - 1);
    } else {
      this.addBumpAnimation('left');
    }
  }

  private addBumpAnimation(direction: 'left' | 'right') {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const distance = direction === 'left' ? 20 : -20;

    grid.style.transition = 'none';
    grid.style.transform = '';
    void grid.offsetWidth;

    grid.style.transition = 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)';
    grid.style.transform = `translateX(${distance}px)`;

    setTimeout(() => {
      grid.style.transition =
        'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
      grid.style.transform = '';
    }, 150);
  }

  private handleScroll() {
    this.debouncedUpdateCenteredItem();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      this.scrollToPrevious();
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this.scrollToNext();
      event.preventDefault();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (!this.projectsGrid?.nativeElement) return;
    const gridElement = this.projectsGrid.nativeElement;
    const firstCard = gridElement.querySelector(
      '.project-card-wrapper'
    ) as HTMLElement;
    if (firstCard) {
      this.cardWidth = firstCard.getBoundingClientRect().width;
    }
    // Reposition cards based on new width
    this.scrollToCard(this.activeCardIndex());
  }

  private handleWheel(e: WheelEvent) {
    // Check for vertical scroll (most common with mouse wheels)
    if (e.deltaY !== 0) {
      e.preventDefault();
      this.debouncedWheelHandler(e.deltaY);
      return;
    }

    // Also handle horizontal scroll (trackpads often use this)
    if (e.deltaX !== 0) {
      e.preventDefault();
      this.debouncedWheelHandler(e.deltaX);
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      if (!this.projectsGrid?.nativeElement) return;

      const gridElement = this.projectsGrid.nativeElement;

      // Dynamically measure card width
      const firstCard = gridElement.querySelector(
        '.project-card-wrapper'
      ) as HTMLElement;
      if (firstCard) {
        // Use getBoundingClientRect for accurate rendered width
        this.cardWidth = firstCard.getBoundingClientRect().width;
      }

      gridElement.addEventListener('wheel', this.wheelHandler, {
        passive: false,
      });

      if (this.projects.length > 0) {
        // Always start at index 0 (first project)
        // Don't try to restore position - it causes navigation issues
        const initialIndex = 0;

        console.log(
          '[Bookshelf] Initializing at index:',
          initialIndex,
          'projects count:',
          this.projects.length
        );

        this.scrollToCard(initialIndex);

        setTimeout(() => {
          gridElement.classList.add('initialized');
        }, 200);
      }
    }, 100);
  }

  selectProject(project: Project) {
    console.log('[Bookshelf] selectProject called');
    console.log('[Bookshelf] recentlyDragged:', this.recentlyDragged);
    console.log('[Bookshelf] recentlyScrolled:', this.recentlyScrolled);

    if (this.recentlyDragged) {
      console.log('[Bookshelf] Ignoring click - recently dragged');
      return;
    }

    if (this.recentlyScrolled) {
      console.log('[Bookshelf] Ignoring click - recently scrolled');
      return;
    }

    // Find the index of the clicked project
    const clickedIndex = this.projects.findIndex(p => p.slug === project.slug);
    const currentActiveIndex = this.activeCardIndex();

    console.log('[Bookshelf] Project clicked:', {
      clickedProject: {
        username: project.username,
        slug: project.slug,
        title: project.title,
      },
      clickedIndex,
      currentActiveIndex,
      allProjects: this.projects.map(p => ({
        username: p.username,
        slug: p.slug,
        title: p.title,
      })),
    });

    // If the clicked card isn't the active one, ONLY scroll to it first
    if (clickedIndex !== -1 && clickedIndex !== currentActiveIndex) {
      console.log('[Bookshelf] Scrolling to card index:', clickedIndex);

      // Set flag to prevent immediate re-clicks during scroll
      this.recentlyScrolled = true;
      setTimeout(() => {
        this.recentlyScrolled = false;
        console.log('[Bookshelf] Scroll cooldown complete, clicks enabled');
      }, 600); // Longer timeout to account for smooth scroll animation

      this.scrollToCard(clickedIndex);
      // DO NOT navigate - just visually center the card
      // DO NOT save the index yet - wait until actual navigation
    } else {
      // If it's already the active card, THEN emit the selection for navigation
      console.log('[Bookshelf] Emitting projectSelected event for:', {
        username: project.username,
        slug: project.slug,
        title: project.title,
      });

      this.projectSelected.emit(project);
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;

    if (this.projectsGrid?.nativeElement) {
      this.projectsGrid.nativeElement.removeEventListener(
        'wheel',
        this.wheelHandler
      );
    }

    // Clean up effect
    if (this.projectsEffectRef) {
      this.projectsEffectRef.destroy();
    }

    // Cancel any pending debounced operations
    this.debouncedUpdateCenteredItem.cancel();
    this.debouncedDragUpdate.cancel();
    this.debouncedWheelHandler.cancel();
  }
  ngAfterViewChecked() {
    if (this.needsRecalculation) {
      this.needsRecalculation = false;
      if (!this.projectsGrid?.nativeElement) return;
      // Re-measure card width
      const gridElement = this.projectsGrid.nativeElement;
      const firstCard = gridElement.querySelector(
        '.project-card-wrapper'
      ) as HTMLElement;
      if (firstCard) {
        this.cardWidth = firstCard.getBoundingClientRect().width;
      }
      // If the current active card index is out of bounds, reset to 0
      let idx = this.activeCardIndex();
      if (this._projects.length === 0) {
        this.activeCardIndex.set(-1);
        return;
      }
      if (idx < 0 || idx >= this._projects.length) {
        idx = 0;
        this.activeCardIndex.set(0);
      }
      // Remove any transition-blocking classes
      gridElement.classList.remove(
        'no-transitions',
        'freeze-position',
        'transitioning'
      );
      // Force reflow
      void gridElement.offsetWidth;
      this.scrollToCard(idx);
      this.updateCardVisuals(idx);
      // Optionally, add 'transitioning' class briefly to trigger transitions
      gridElement.classList.add('transitioning');
      setTimeout(() => {
        gridElement.classList.remove('transitioning');
      }, 10);
    }
  }
}




