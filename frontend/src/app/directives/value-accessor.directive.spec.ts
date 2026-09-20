import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';

import { ValueAccessorDirective } from './value-accessor.directive';

/**
 * Stands in for `ngx-input-color` and friends: value reachable only through the
 * `ControlValueAccessor` contract, and -- like the real ones -- a `writeValue`
 * that reports straight back out through the registered change handler.
 */
@Component({
  selector: 'app-stub-accessor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => StubAccessorComponent),
      multi: true,
    },
  ],
})
class StubAccessorComponent implements ControlValueAccessor {
  /** Every value handed to {@link writeValue}, in order. */
  readonly writes: string[] = [];
  /** Set when the accessor should echo writes back, as the real ones do. */
  echoWrites = false;
  /**
   * What an echoing write reports instead of the value written -- the real
   * accessors answer anything they cannot parse with their own fallback.
   */
  coerceTo: string | null = null;

  private onChange: (value: string) => void = () => {};

  writeValue(value: string): void {
    this.writes.push(value);
    if (this.echoWrites) this.onChange(this.coerceTo ?? value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(): void {}

  /** Report a change the way a user interaction inside the widget would. */
  report(value: string): void {
    this.onChange(value);
  }
}

@Component({
  selector: 'app-host',
  imports: [StubAccessorComponent, ValueAccessorDirective],
  template: `<app-stub-accessor
    [appValue]="value()"
    (appValueChange)="seen.push($event)" />`,
})
class HostComponent {
  readonly value = signal('first');
  readonly seen: string[] = [];
}

describe('ValueAccessorDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let accessor: StubAccessorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    accessor = fixture.debugElement.query(
      By.directive(StubAccessorComponent)
    ).componentInstance;
    // The mount write suppresses reports until the next macrotask; let it
    // settle so each test starts from a quiet accessor.
    await settle();
  });

  /** Let a write's suppression window close. */
  function settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve));
  }

  it('writes the initial value into the accessor', () => {
    expect(accessor.writes).toEqual(['first']);
  });

  it('writes later values into the accessor', () => {
    host.value.set('second');
    fixture.detectChanges();
    expect(accessor.writes).toEqual(['first', 'second']);
  });

  it('does not rewrite a value that has not changed', () => {
    host.value.set('first');
    fixture.detectChanges();
    expect(accessor.writes).toEqual(['first']);
  });

  it('emits what the accessor reports', () => {
    accessor.report('from-widget');
    expect(host.seen).toEqual(['from-widget']);
  });

  it('does not write back a value the accessor just reported', () => {
    accessor.report('from-widget');
    host.value.set('from-widget');
    fixture.detectChanges();
    expect(accessor.writes).toEqual(['first']);
  });

  it('writes again once the value moves off what the accessor reported', () => {
    accessor.report('from-widget');
    host.value.set('elsewhere');
    fixture.detectChanges();
    expect(accessor.writes).toEqual(['first', 'elsewhere']);
  });

  it('does not report a write back out as a user edit', async () => {
    // The real accessors call the change handler from inside writeValue, which
    // the ControlValueAccessor contract forbids. That report is not an edit.
    accessor.echoWrites = true;
    host.value.set('echoed');
    fixture.detectChanges();
    await settle();
    expect(accessor.writes).toEqual(['first', 'echoed']);
    expect(host.seen).toEqual([]);
  });

  it('does not let a write it could not represent come back as an edit', async () => {
    // A colour picker handed a gradient answers with black; a gradient designer
    // handed a hex answers with a random gradient. Either would be persisted as
    // though the user had chosen it.
    accessor.echoWrites = true;
    accessor.coerceTo = '#000000';
    host.value.set('linear-gradient(135deg, #000 0%, #fff 100%)');
    fixture.detectChanges();
    await settle();
    expect(host.seen).toEqual([]);
  });

  it('still reports a user edit made after a write settles', async () => {
    accessor.echoWrites = true;
    accessor.coerceTo = '#000000';
    host.value.set('linear-gradient(135deg, #000 0%, #fff 100%)');
    fixture.detectChanges();
    await settle();

    accessor.report('#ff0000');
    expect(host.seen).toEqual(['#ff0000']);
  });
});
