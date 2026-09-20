import {
  ChangeDetectorRef,
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
 * Echo suppression matters as much as the plumbing. These accessors call their
 * registered change handler from inside `writeValue`, so every write bounces
 * straight back out; left alone, the returning value would be written again and
 * the accessor would rebuild its state underneath whatever the user is doing --
 * for a gradient that means new stop ids mid-drag. {@link accessorValue} tracks
 * what the accessor last told us it holds, and a write that matches is skipped.
 * This mirrors how `NgModel` compares against its own view model, so behaviour
 * is unchanged from the `ngModel` binding this replaces.
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

  /** Value to push into the accessor. */
  readonly value = input.required<string>({ alias: 'appValue' });

  /** Emits whatever the accessor reports, verbatim and unvalidated. */
  readonly appValueChange = output<string>();

  constructor() {
    this.accessor.registerOnChange((next: string) => {
      this.accessorValue = next;
      this.appValueChange.emit(next);
    });

    effect(() => {
      const next = this.value();
      // untracked: writeValue runs library code of unknown appetite, and
      // anything it happens to read must not become a dependency of this write.
      untracked(() => this.write(next));
    });
  }

  private write(next: string): void {
    if (Object.is(this.accessorValue, next)) return;
    this.accessorValue = next;
    this.accessor.writeValue(next);
    this.accessorView.markForCheck();
  }
}
