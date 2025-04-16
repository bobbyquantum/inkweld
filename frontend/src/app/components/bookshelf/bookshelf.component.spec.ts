import { CdkDragEnd } from '@angular/cdk/drag-drop';
import { ProjectDto } from '@inkweld/index';

import { BookshelfComponent } from './bookshelf.component';

// Mock the ProjectCardComponent
jest.mock('@components/project-card/project-card.component', () => ({
  ProjectCardComponent: class {
    project: any;
  },
}));

describe('BookshelfComponent', () => {
  let component: BookshelfComponent;
  let mockProjects: ProjectDto[];

  beforeEach(() => {
    // Mock project data
    mockProjects = [
      {
        title: 'Project 1',
        slug: 'project-1',
        description: 'Test project 1',
        username: 'testuser',
      },
      {
        title: 'Project 2',
        slug: 'project-2',
        description: 'Test project 2',
        username: 'testuser',
      },
      {
        title: 'Project 3',
        slug: 'project-3',
        description: 'Test project 3',
        username: 'testuser',
      },
    ] as ProjectDto[];

    // Create component directly without TestBed to avoid DOM manipulation
    component = new BookshelfComponent();
    component.projects = mockProjects;

    // Mock the projectsGrid element
    component.projectsGrid = {
      nativeElement: {
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          contains: jest.fn().mockReturnValue(false),
        },
        querySelectorAll: jest.fn().mockReturnValue([]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        style: {},
        offsetWidth: 100,
        // Mock closest to return a container with querySelector and getBoundingClientRect
        closest: jest.fn().mockImplementation((selector: string) => {
          if (selector === '.bookshelf-container') {
            return {
              querySelector: jest.fn().mockImplementation((sel: string) => {
                if (sel === '.center-selector') {
                  return {
                    getBoundingClientRect: jest
                      .fn()
                      .mockReturnValue({ left: 500, width: 10 }),
                  };
                }
                return null;
              }),
              getBoundingClientRect: jest
                .fn()
                .mockReturnValue({ left: 400, width: 800 }),
            };
          }
          return null;
        }),
      },
    } as any;
    // Set a default card width for tests to simulate measured value
    component['cardWidth'] = 350;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Navigation', () => {
    it('should scroll to next card when scrollToNext is called', () => {
      // Setup
      jest.spyOn(component, 'scrollToCard');
      component['activeCardIndex'].set(0);

      // Execute
      component.scrollToNext();

      // Assert
      expect(component.scrollToCard).toHaveBeenCalledWith(1);
    });

    it('should scroll to previous card when scrollToPrevious is called', () => {
      // Setup
      jest.spyOn(component, 'scrollToCard');
      component['activeCardIndex'].set(1);

      // Execute
      component.scrollToPrevious();

      // Assert
      expect(component.scrollToCard).toHaveBeenCalledWith(0);
    });

    it('should add bump animation when at first card and scrolling previous', () => {
      // Setup
      component['activeCardIndex'].set(0);
      jest.spyOn(component as any, 'addBumpAnimation');
      jest.spyOn(component, 'scrollToCard');

      // Execute
      component.scrollToPrevious();

      // Assert
      expect(component['addBumpAnimation']).toHaveBeenCalledWith('left');
      expect(component.scrollToCard).not.toHaveBeenCalled();
    });

    it('should add bump animation when at last card and scrolling next', () => {
      // Setup
      component['activeCardIndex'].set(mockProjects.length - 1);
      jest.spyOn(component as any, 'addBumpAnimation');
      jest.spyOn(component, 'scrollToCard');

      // Execute
      component.scrollToNext();

      // Assert
      expect(component['addBumpAnimation']).toHaveBeenCalledWith('right');
      expect(component.scrollToCard).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should handle left arrow key', () => {
      // Setup
      jest.spyOn(component, 'scrollToPrevious');
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      jest.spyOn(event, 'preventDefault');

      // Execute
      component.handleKeyboardEvent(event);

      // Assert
      expect(component.scrollToPrevious).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should handle right arrow key', () => {
      // Setup
      jest.spyOn(component, 'scrollToNext');
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      jest.spyOn(event, 'preventDefault');

      // Execute
      component.handleKeyboardEvent(event);

      // Assert
      expect(component.scrollToNext).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should not respond to other keys', () => {
      // Setup
      jest.spyOn(component, 'scrollToPrevious');
      jest.spyOn(component, 'scrollToNext');
      const event = new KeyboardEvent('keydown', { key: 'A' });
      jest.spyOn(event, 'preventDefault');

      // Execute
      component.handleKeyboardEvent(event);

      // Assert
      expect(component.scrollToPrevious).not.toHaveBeenCalled();
      expect(component.scrollToNext).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('Project Selection', () => {
    it('should emit selected project when clicking on active card', () => {
      // Setup
      const selectedProject = mockProjects[0];
      jest.spyOn(component.projectSelected, 'emit');
      component['activeCardIndex'].set(0);
      component['recentlyDragged'] = false;

      // Execute
      component.selectProject(selectedProject);

      // Assert
      expect(component.projectSelected.emit).toHaveBeenCalledWith(
        selectedProject
      );
    });

    it('should scroll to card but not emit when clicking on non-active card', () => {
      // Setup
      const nonActiveProject = mockProjects[1];
      jest.spyOn(component.projectSelected, 'emit');
      jest.spyOn(component, 'scrollToCard');
      component['activeCardIndex'].set(0);

      // Execute
      component.selectProject(nonActiveProject);

      // Assert
      expect(component.scrollToCard).toHaveBeenCalledWith(1);
      expect(component.projectSelected.emit).not.toHaveBeenCalled();
    });

    it('should not emit or scroll when recently dragged', () => {
      // Setup
      const selectedProject = mockProjects[0];
      jest.spyOn(component.projectSelected, 'emit');
      jest.spyOn(component, 'scrollToCard');
      component['recentlyDragged'] = true;

      // Execute
      component.selectProject(selectedProject);

      // Assert
      expect(component.projectSelected.emit).not.toHaveBeenCalled();
      expect(component.scrollToCard).not.toHaveBeenCalled();
    });
  });

  describe('Drag Interactions', () => {
    it('should set up drag start state', () => {
      // Setup
      const expectedIndex = 1;
      component['activeCardIndex'].set(expectedIndex);

      // Execute
      component.onDragStarted();

      // Assert
      expect(component['dragStartActiveIndex']).toBe(expectedIndex);
      expect(component['dragTargetIndex']).toBe(-1);
      expect(
        component.projectsGrid!.nativeElement.classList.add
      ).toHaveBeenCalledWith('dragging');
    });

    it('should update card visuals during drag', () => {
      // Setup
      jest.spyOn(component, 'findCenterCardIndex').mockReturnValue(1);
      jest.spyOn(component as any, 'updateCardVisuals');

      // Execute
      component.onDragMoved();

      // Assert
      expect(component.findCenterCardIndex).toHaveBeenCalled();
      expect(component['updateCardVisuals']).toHaveBeenCalledWith(1);
    });

    it('should handle drag end correctly', () => {
      // Setup a mock drag event
      const mockEvent = {
        source: {
          reset: jest.fn(),
          getFreeDragPosition: jest.fn().mockReturnValue({ x: 0, y: 0 }),
        },
      } as unknown as CdkDragEnd;

      jest.spyOn(component, 'findCenterCardIndex').mockReturnValue(1);
      jest.spyOn(component, 'scrollToCard').mockImplementation(() => {});

      // Create mock cards
      const mockCards = mockProjects.map(() => {
        return {
          getBoundingClientRect: jest
            .fn()
            .mockReturnValue({ left: 100, width: 100 }),
          style: {},
          classList: {
            add: jest.fn(),
            remove: jest.fn(),
          },
        } as unknown as HTMLElement;
      });

      // Update the mock to return our cards
      component.projectsGrid!.nativeElement.querySelectorAll = jest
        .fn()
        .mockReturnValue(mockCards);
      // Also mock querySelector for card width measurement
      component.projectsGrid!.nativeElement.querySelector = jest
        .fn()
        .mockReturnValue(mockCards[0]);

      // Mock setTimeout
      jest.useFakeTimers();

      // Execute
      component.onDragEnded(mockEvent);

      // Assert immediate effects
      expect(mockEvent.source.reset).toHaveBeenCalled();
      expect(
        component.projectsGrid!.nativeElement.classList.remove
      ).toHaveBeenCalledWith('dragging');

      // Fast-forward timers
      jest.advanceTimersByTime(400); // past all timeouts

      // Check final state
      expect(component['recentlyDragged']).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('Cleanup', () => {
    it('should clean up event listeners and cancel debounced functions on destroy', () => {
      // Setup - the mock for projectsGrid is already set up in beforeEach
      jest.spyOn(component['debouncedUpdateCenteredItem'], 'cancel');
      jest.spyOn(component['debouncedDragUpdate'], 'cancel');
      jest.spyOn(component['debouncedWheelHandler'], 'cancel');

      // Execute
      component.ngOnDestroy();

      // Assert
      expect(
        component.projectsGrid!.nativeElement.removeEventListener
      ).toHaveBeenCalledWith('wheel', component['wheelHandler']);
      expect(
        component['debouncedUpdateCenteredItem'].cancel
      ).toHaveBeenCalled();
      expect(component['debouncedDragUpdate'].cancel).toHaveBeenCalled();
      expect(component['debouncedWheelHandler'].cancel).toHaveBeenCalled();
    });
  });

  describe('Finding centered card', () => {
    it('should find the closest card to center', () => {
      // Setup mock DOM elements with positions
      const centerRect = { left: 500, width: 10 };

      // Mock document.querySelector to return our center element
      jest.spyOn(document, 'querySelector').mockImplementation(
        () =>
          ({
            getBoundingClientRect: () => centerRect,
          }) as unknown as Element
      );

      // Create mocks for the card elements
      const mockCards = [
        { getBoundingClientRect: () => ({ left: 300, width: 200 }) }, // Center at 400
        { getBoundingClientRect: () => ({ left: 450, width: 200 }) }, // Center at 550 - closest to centerRect (505)
        { getBoundingClientRect: () => ({ left: 600, width: 200 }) }, // Center at 700
      ];

      // Update the mock to return our cards
      component.projectsGrid!.nativeElement.querySelectorAll = jest
        .fn()
        .mockReturnValue(mockCards as any);
      // Also mock querySelector for card width measurement
      component.projectsGrid!.nativeElement.querySelector = jest
        .fn()
        .mockReturnValue(mockCards[0]);

      // Execute
      const result = component.findCenterCardIndex();

      // Assert
      expect(result).toBe(1); // The middle card should be closest
    });

    it('should return -1 when no cards are found', () => {
      // Update the mock to return empty array
      component.projectsGrid!.nativeElement.querySelectorAll = jest
        .fn()
        .mockReturnValue([]);

      // Execute
      const result = component.findCenterCardIndex();

      // Assert
      expect(result).toBe(-1);
    });
  });

  describe('Wheel handling', () => {
    it('should handle vertical wheel events', () => {
      // Setup
      const wheelEvent = new WheelEvent('wheel', { deltaY: 100 });
      jest.spyOn(wheelEvent, 'preventDefault');
      jest
        .spyOn(component['debouncedWheelHandler'], 'cancel')
        .mockImplementation(() => {});

      // We need to spy on the private method
      const handleWheelSpy = jest.spyOn(component as any, 'handleWheel');

      // Execute the method directly since we can't easily trigger wheel events
      component['handleWheel'](wheelEvent);

      // Assert
      expect(wheelEvent.preventDefault).toHaveBeenCalled();
      expect(handleWheelSpy).toHaveBeenCalled();
    });

    it('should handle horizontal wheel events', () => {
      // Setup
      const wheelEvent = new WheelEvent('wheel', { deltaX: 100, deltaY: 0 });
      jest.spyOn(wheelEvent, 'preventDefault');
      jest
        .spyOn(component['debouncedWheelHandler'], 'cancel')
        .mockImplementation(() => {});

      // Execute the method directly
      component['handleWheel'](wheelEvent);

      // Assert
      expect(wheelEvent.preventDefault).toHaveBeenCalled();
    });
  });
});
