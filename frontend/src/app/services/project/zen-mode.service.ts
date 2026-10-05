import { Injectable } from '@angular/core';
import { type Observable, Subject } from 'rxjs';

/**
 * Lets components inside a project tab (e.g. the document editor's status
 * bar) ask the project shell to toggle zen mode. The shell owns the zen state
 * because it renders the full-screen overlay and decides whether the current
 * tab supports it.
 */
@Injectable({ providedIn: 'root' })
export class ZenModeService {
  private readonly toggleRequests = new Subject<void>();

  /** Emits each time a component asks for zen mode to be toggled. */
  readonly toggleRequested$: Observable<void> =
    this.toggleRequests.asObservable();

  requestToggle(): void {
    this.toggleRequests.next();
  }
}
