import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { MouseDragEvent, MouseDragService } from './mouse-drag.service';

describe('MouseDragService', () => {
  let service: MouseDragService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MouseDragService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Drag Events', () => {
    it('should emit start event on drag start', fakeAsync(() => {
      const mockEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200,
      });
      let receivedEvent: MouseDragEvent | undefined;

      service.dragEvents$.subscribe(event => (receivedEvent = event));
      service.startDrag(mockEvent);
      tick();

      expect(receivedEvent).toEqual({
        type: 'start',
        clientX: 100,
        clientY: 200,
        deltaX: 0,
        deltaY: 0,
      });
    }));

    it('should emit move events during drag', fakeAsync(() => {
      const startEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200,
      });
      const moveEvent = new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 250,
      });
      const events: MouseDragEvent[] = [];

      service.dragMoveEvents$.subscribe(event => events.push(event));
      service.startDrag(startEvent);
      document.dispatchEvent(moveEvent);
      tick();

      expect(events[0]).toEqual({
        type: 'move',
        clientX: 150,
        clientY: 250,
        deltaX: 50,
        deltaY: 50,
      });
    }));

    it('should emit end event on drag end', fakeAsync(() => {
      const startEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200,
      });
      const endEvent = new MouseEvent('mouseup', {
        clientX: 150,
        clientY: 250,
      });
      let receivedEvent: MouseDragEvent;

      service.dragEndEvents$.subscribe(event => (receivedEvent = event));
      service.startDrag(startEvent);
      document.dispatchEvent(endEvent);
      tick();

      expect(receivedEvent!).toEqual({
        type: 'end',
        clientX: 150,
        clientY: 250,
        deltaX: 50,
        deltaY: 50,
      });
    }));
  });

  describe('Edge Cases', () => {
    it('should handle multiple rapid drags', fakeAsync(() => {
      const events: MouseDragEvent[] = [];
      service.dragEvents$.subscribe(event => events.push(event));

      // First drag
      service.startDrag(
        new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
      );
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 150, clientY: 150 })
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 150, clientY: 150 })
      );
      tick();

      // Second drag
      service.startDrag(
        new MouseEvent('mousedown', { clientX: 200, clientY: 200 })
      );
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 250, clientY: 250 })
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 250, clientY: 250 })
      );
      tick();

      expect(events.length).toBe(2);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('start');
    }));

    it('should handle window blur during drag', fakeAsync(() => {
      const events: MouseDragEvent[] = [];
      service.dragEndEvents$.subscribe(event => events.push(event));

      service.startDrag(
        new MouseEvent('mousedown', { clientX: 100, clientY: 100 })
      );
      window.dispatchEvent(new Event('blur'));
      tick();

      expect(events[0].type).toBe('end');
    }));
  });
});
