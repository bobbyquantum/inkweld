import {
  ChangeDetectorRef,
  DestroyRef,
  Directive,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Binds a plain value to a third-party ControlValueAccessor, without a form.
 *
 * Some libraries -- `ngx-input-color` and `ngx-input-gradient` here -- expose
 * their value *only* through the `ControlValueAccessor` contract: no value
 * input, no value event, just `writeValue` and `registerOnChange`. Reaching
 * them used to mean dragging in `ngModel`, and with it a whole standalone form
 * control, a validator pipeline and `NgControlStatus`'s host classes, purely to
 * move one string in each direction.
 *
 * This directive talks to the accessor directly instead: it injects whatever
 * `NG_VALUE_ACCESSOR` the host element provides and drives it from a signal
 * input, reporting changes back through an output.
 *
 * ```html
 * <ngx-input-color
 *   [appValue]="value()"
 *   (appValueChange)="onColorChange($event)"></ngx-input-color>
 * ```
 *
 * Echo suppression matters as much as the plumbing, and these accessors need
 * two kinds of it.
 *
 * The `ControlValueAccessor` contract says `writeValue` must not raise a
 * change. These accessors raise one anyway, from inside `writeValue` itself.
 * That is not merely noisy: a value the accessor cannot represent comes back
 * as its own fallback -- black for a colour picker, a *random* gradient for a
 * gradient designer -- and a host that trusts its own change output will
 * persist that fallback as though the user had chosen it. So a report caused
 * by a write we initiated is dropped ({@link writing}), and only what the user
 * does reaches {@link appValueChange}.
 *
 * Separately, {@link accessorValue} tracks what the accessor last told us it
 * holds, and a write that matches is skipped -- otherwise a value round-tripping
 * back from the host would be written again and the accessor would rebuild its
 * state underneath whatever the user is doing (for a gradient, fresh stop ids
 * mid-drag). This mirrors how `NgModel` compares against its own view model.
 */
@Directive({
  selector: '[appValue]',
})
export class ValueAccessorDirective {
  /**
   * The host element's own value accessor. `self` because we want the accessor
   * on this element, never one inherited from an enclosing form control.
   */
  private readonly accessor: ControlValueAccessor = inject(NG_VALUE_ACCESSOR, {
    self: true,
  })[0];

  /**
   * Injected on a component's host element, this resolves to that component's
   * own view. The accessors are `OnPush` and don't mark themselves after a
   * programmatic write, so nothing would repaint until the next unrelated pass.
   */
  private readonly accessorView = inject(ChangeDetectorRef);

  /** What the accessor last reported holding; see the echo note above. */
  private accessorValue: string | undefined;

  /**
   * Set while a write we initiated is still settling, so the report it
   * provokes is not mistaken for a user edit. These accessors normalise
   * asynchronously, so the report lands a microtask or two after `writeValue`
   * returns rather than inside it; the flag is therefore cleared on the next
   * macrotask, which every pending microtask precedes and which no user
   * interaction can arrive before.
   */
  private writing = false;
  private writingTimer: ReturnType<typeof setTimeout> | null = null;

  /** Value to push into the accessor. */
  readonly value = input.required<string>({ alias: 'appValue' });

  /** Emits what the accessor reports for a user edit, verbatim and unvalidated. */
  readonly appValueChange = output<string>();

  constructor() {
    this.accessor.registerOnChange((next: string) => {
      this.accessorValue = next;
      if (this.writing) return;
      this.appValueChange.emit(next);
    });

    effect(() => {
      const next = this.value();
      // untracked: writeValue runs library code of unknown appetite, and
      // anything it happens to read must not become a dependency of this write.
      untracked(() => this.write(next));
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.writingTimer !== null) {
        clearTimeout(this.writingTimer);
        this.writingTimer = null;
      }
    });
  }

  private write(next: string): void {
    if (Object.is(this.accessorValue, next)) return;
    this.accessorValue = next;
    this.writing = true;
    if (this.writingTimer !== null) clearTimeout(this.writingTimer);
    this.writingTimer = setTimeout(() => {
      this.writing = false;
      this.writingTimer = null;
    });
    this.accessor.writeValue(next);
    this.accessorView.markForCheck();
  }
}
