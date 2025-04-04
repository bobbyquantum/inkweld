import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
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
import { debounce } from 'lodash-es';

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

  @ViewChild('projectsGrid') projectsGrid?: ElementRef<HTMLElement>;

  protected activeCardIndex = signal(-1);

  private recentlyDragged = false;
  private dragTargetIndex = -1;
  private dragStartActiveIndex = -1;
  private wheelHandler = (e: WheelEvent) => this.handleWheel(e);

  // Debounced functions
  private debouncedUpdateCenteredItem = debounce(this.updateCenteredItem, 100);
  private debouncedDragUpdate = debounce(() => {
    const centerIndex = this.findCenterCardIndex();
    this.dragTargetIndex = centerIndex;
    this.activeCardIndex.set(centerIndex);

    if (centerIndex !== this.activeCardIndex()) {
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

    setTimeout(() => {
      if (!this.projectsGrid?.nativeElement) return;
      event.source.reset();
      grid.style.transform = '';
      grid.style.webkitTransform = '';
      void grid.offsetWidth;

      if (this.dragTargetIndex === -1) {
        this.dragTargetIndex = this.findCenterCardIndex();
      }

      if (this.dragTargetIndex >= 0) {
        this.scrollToCard(this.dragTargetIndex);
      } else {
        this.scrollToCard(this.dragStartActiveIndex);
      }
    }, 50);

    this.recentlyDragged = true;
    setTimeout(() => {
      this.recentlyDragged = false;
    }, 300);
  }

  onDragMoved() {
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
        element.style.opacity =
          distance === 0 ? '1' : distance === 1 ? '0.8' : '0.5';

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

  updateCenteredItem() {
    if (!this.projectsGrid?.nativeElement) return;

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

    const centerSelector = document.querySelector('.center-selector');
    let centerX = window.innerWidth / 2;

    if (centerSelector) {
      const centerRect = centerSelector.getBoundingClientRect();
      centerX = centerRect.left + centerRect.width / 2;
    }

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

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

  scrollToCard(index: number) {
    if (!this.projectsGrid?.nativeElement) return;

    const grid = this.projectsGrid.nativeElement;
    const cards = Array.from(grid.querySelectorAll('.project-card-wrapper'));

    if (index >= 0 && index < cards.length) {
      cards.forEach(card => {
        const element = card as HTMLElement;
        element.style.transition = '';
      });

      if (this.activeCardIndex() !== index) {
        this.activeCardIndex.set(index);
      }

      void grid.offsetWidth;

      const CARD_WIDTH = 350;
      const CARD_GAP = 120;

      const viewportWidth = window.innerWidth;
      const viewportCenter = viewportWidth / 2;

      cards.forEach((card, i) => {
        const element = card as HTMLElement;

        const position = viewportCenter + (i - index) * (CARD_WIDTH + CARD_GAP);

        element.style.left = `${position}px`;
        element.style.transform =
          i === index ? 'translateX(-50%) scale(1.1)' : 'translateX(-50%)';

        const distance = Math.abs(i - index);
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
    const currentIndex = this.activeCardIndex();
    const projectCount = this.projects.length;

    if (currentIndex < projectCount - 1) {
      this.scrollToCard(currentIndex + 1);
    } else {
      this.addBumpAnimation('right');
    }
  }

  scrollToPrevious() {
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

      gridElement.addEventListener('wheel', this.wheelHandler, {
        passive: false,
      });

      if (this.projects.length > 0) {
        this.scrollToCard(0);

        setTimeout(() => {
          gridElement.classList.add('initialized');
        }, 200);
      }
    }, 100);
  }

  selectProject(project: ProjectDto) {
    if (this.recentlyDragged) {
      return;
    }

    // Find the index of the clicked project
    const clickedIndex = this.projects.findIndex(p => p.slug === project.slug);

    // If the clicked card isn't the active one, scroll to it first
    if (clickedIndex !== -1 && clickedIndex !== this.activeCardIndex()) {
      this.scrollToCard(clickedIndex);
    } else {
      // If it's already the active card, emit the selection immediately
      this.projectSelected.emit(project);
    }
  }

  ngOnDestroy() {
    if (this.projectsGrid?.nativeElement) {
      this.projectsGrid.nativeElement.removeEventListener(
        'wheel',
        this.wheelHandler
      );
    }

    // Cancel any pending debounced operations
    this.debouncedUpdateCenteredItem.cancel();
    this.debouncedDragUpdate.cancel();
    this.debouncedWheelHandler.cancel();
  }
}
