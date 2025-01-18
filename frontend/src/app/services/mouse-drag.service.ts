import { Injectable } from '@angular/core';
import { fromEvent, Observable, Subject, Subscription } from 'rxjs';
import { filter, map, takeUntil } from 'rxjs/operators';

export interface MouseDragEvent {
  type: 'start' | 'move' | 'end';
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
}

@Injectable({ providedIn: 'root' })
export class MouseDragService {
  private dragStart$ = new Subject<MouseDragEvent>();
  private dragMove$ = new Subject<MouseDragEvent>();
  private dragEnd$ = new Subject<MouseDragEvent>();
  private startX = 0;
  private startY = 0;
  private moveSubscription?: Subscription;
  private upSubscription?: Subscription;
  private blurSubscription?: Subscription;

  constructor() {
    this.setupDocumentListeners();
  }

  get dragEvents$(): Observable<MouseDragEvent> {
    return this.dragStart$.asObservable();
  }

  get dragMoveEvents$(): Observable<MouseDragEvent> {
    return this.dragMove$.pipe(takeUntil(this.dragEnd$));
  }

  get dragEndEvents$(): Observable<MouseDragEvent> {
    return this.dragEnd$;
  }

  startDrag(event: MouseEvent): void {
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.dragStart$.next({
      type: 'start',
      clientX: event.clientX,
      clientY: event.clientY,
      deltaX: 0,
      deltaY: 0,
    });
  }

  private setupDocumentListeners(): void {
    this.moveSubscription = fromEvent<MouseEvent>(document, 'mousemove')
      .pipe(
        filter(() => this.dragStart$.observed || this.dragMove$.observed),
        map(event => ({
          type: 'move' as const,
          clientX: event.clientX,
          clientY: event.clientY,
          deltaX: event.clientX - this.startX,
          deltaY: event.clientY - this.startY,
        }))
      )
      .subscribe(event => this.dragMove$.next(event));

    this.upSubscription = fromEvent<MouseEvent>(document, 'mouseup')
      .pipe(
        filter(() => this.dragStart$.observed || this.dragEnd$.observed),
        map(event => ({
          type: 'end' as const,
          clientX: event.clientX,
          clientY: event.clientY,
          deltaX: event.clientX - this.startX,
          deltaY: event.clientY - this.startY,
        }))
      )
      .subscribe(event => {
        this.dragEnd$.next(event);
        this.cleanupSubscriptions();
      });

    this.blurSubscription = fromEvent(window, 'blur').subscribe(() => {
      this.dragEnd$.next({
        type: 'end',
        clientX: this.startX,
        clientY: this.startY,
        deltaX: 0,
        deltaY: 0,
      });
      this.cleanupSubscriptions();
    });
  }

  private cleanupSubscriptions(): void {
    // Only cleanup if no more drags are being tracked
    if (
      !this.dragStart$.observed &&
      !this.dragMove$.observed &&
      !this.dragEnd$.observed
    ) {
      this.moveSubscription?.unsubscribe();
      this.upSubscription?.unsubscribe();
      this.blurSubscription?.unsubscribe();
    }
  }
}
