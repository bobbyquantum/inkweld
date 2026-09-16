import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PullToRefreshDirective } from './pull-to-refresh.directive';

interface TestTouch {
  identifier: number;
  clientX: number;
  clientY: number;
}

/**
 * jsdom has no TouchEvent, so build a plain event carrying the touch lists the
 * directive reads.
 */
function touchEvent(
  type: string,
  touches: TestTouch[],
  changedTouches: TestTouch[] = touches
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const asList = (list: TestTouch[]) => ({ ...list, length: list.length });
  Object.defineProperty(event, 'touches', { value: asList(touches) });
  Object.defineProperty(event, 'changedTouches', {
    value: asList(changedTouches),
  });
  return event;
}

/** One finger at the origin of the drag. */
const START: TestTouch = { identifier: 1, clientX: 100, clientY: 100 };

/** A touch `dy` px below the start, optionally `dx` px across. */
function moved(dy: number, dx = 0): TestTouch {
  return {
    identifier: START.identifier,
    clientX: START.clientX + dx,
    clientY: START.clientY + dy,
  };
}

// Signals, not plain fields: a zoneless fixture only refreshes views that
// something has marked dirty, and a bare property write does not.
@Component({
  imports: [PullToRefreshDirective],
  template: `
    <div
      class="scroller"
      [appPullToRefresh]="action()"
      [pullToRefreshDisabled]="disabled()"></div>
  `,
})
class HostComponent {
  readonly action = signal<() => Promise<unknown>>(() => Promise.resolve());
  readonly disabled = signal(false);
}

describe('PullToRefreshDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let scroller: HTMLElement;
  let directive: PullToRefreshDirective;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();

    const debugEl = fixture.debugElement.query(
      By.directive(PullToRefreshDirective)
    );
    scroller = debugEl.nativeElement as HTMLElement;
    directive = debugEl.injector.get(PullToRefreshDirective);
  });

  /** Runs a drag of `dy` px without lifting the finger. */
  function drag(dy: number, dx = 0): Event {
    scroller.dispatchEvent(touchEvent('touchstart', [START]));
    const move = touchEvent('touchmove', [moved(dy, dx)]);
    scroller.dispatchEvent(move);
    return move;
  }

  function release(dy: number): void {
    scroller.dispatchEvent(touchEvent('touchend', [], [moved(dy)]));
  }

  function pullDistance(): string {
    return scroller.style.getPropertyValue('--pull-distance');
  }

  it('starts idle', () => {
    expect(directive.state()).toBe('idle');
    expect(directive.active()).toBe(false);
  });

  it('enters the pulling state once the drag clears the slop', () => {
    drag(40);

    expect(directive.state()).toBe('pulling');
    expect(directive.dragging()).toBe(true);
    // Half the finger's travel, per the drag resistance.
    expect(pullDistance()).toBe('20px');
  });

  it('ignores travel below the slop threshold', () => {
    drag(4);

    expect(directive.state()).toBe('idle');
    expect(pullDistance()).toBe('');
  });

  it('arms once the pull passes the trigger distance', () => {
    drag(140);

    expect(directive.state()).toBe('armed');
    expect(pullDistance()).toBe('70px');
  });

  it('caps the pull distance', () => {
    drag(400);

    expect(pullDistance()).toBe('80px');
  });

  it('cancels the browser scroll once it owns the gesture', () => {
    const move = drag(40);

    expect(move.defaultPrevented).toBe(true);
  });

  it('leaves a sideways drag to the scroller', () => {
    const move = drag(40, 60);

    expect(directive.state()).toBe('idle');
    expect(move.defaultPrevented).toBe(false);
  });

  it('leaves an upward drag to the scroller', () => {
    drag(-40);

    expect(directive.state()).toBe('idle');
  });

  it('runs the action on release when armed, then settles', async () => {
    let settle: () => void = () => undefined;
    const action = vi.fn(
      () =>
        new Promise<void>(resolve => {
          settle = resolve;
        })
    );
    host.action.set(action);
    fixture.detectChanges();

    drag(140);
    release(140);

    expect(action).toHaveBeenCalledTimes(1);
    expect(directive.state()).toBe('refreshing');
    expect(directive.dragging()).toBe(false);
    expect(pullDistance()).toBe('48px');

    settle();
    await fixture.whenStable();

    expect(directive.state()).toBe('idle');
    expect(pullDistance()).toBe('0px');
  });

  it('keeps the indicator up until a slow action settles', async () => {
    const action = vi.fn(() => Promise.reject(new Error('offline')));
    host.action.set(action);
    fixture.detectChanges();

    drag(140);
    release(140);
    await fixture.whenStable();

    // A rejection is the action's business to report; we just stop spinning.
    expect(directive.state()).toBe('idle');
  });

  it('does not refresh when released short of the trigger', () => {
    const action = vi.fn(() => Promise.resolve());
    host.action.set(action);
    fixture.detectChanges();

    drag(40);
    release(40);

    expect(action).not.toHaveBeenCalled();
    expect(directive.state()).toBe('idle');
    expect(pullDistance()).toBe('0px');
  });

  it('resets when the gesture is cancelled', () => {
    drag(140);
    scroller.dispatchEvent(touchEvent('touchcancel', []));

    expect(directive.state()).toBe('idle');
    expect(pullDistance()).toBe('0px');
  });

  it('ignores the gesture while disabled', () => {
    host.disabled.set(true);
    fixture.detectChanges();

    drag(140);

    expect(directive.state()).toBe('idle');
  });

  it('ignores the gesture when the content is scrolled away from the top', () => {
    Object.defineProperty(scroller, 'scrollTop', {
      value: 120,
      configurable: true,
    });

    drag(140);

    expect(directive.state()).toBe('idle');
  });

  it('ignores multi-touch gestures', () => {
    scroller.dispatchEvent(
      touchEvent('touchstart', [START, { ...START, identifier: 2 }])
    );
    scroller.dispatchEvent(touchEvent('touchmove', [moved(140)]));

    expect(directive.state()).toBe('idle');
  });

  it('detaches its listeners on destroy', () => {
    fixture.destroy();

    scroller.dispatchEvent(touchEvent('touchstart', [START]));
    scroller.dispatchEvent(touchEvent('touchmove', [moved(140)]));

    expect(directive.state()).toBe('idle');
  });
});
