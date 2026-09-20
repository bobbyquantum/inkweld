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

  private onChange: (value: string) => void = () => {};

  writeValue(value: string): void {
    this.writes.push(value);
    if (this.echoWrites) this.onChange(value);
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
  });

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

  it('settles when the accessor echoes its own writes', () => {
    // The real accessors call the change handler from inside writeValue, so a
    // write bounces out, round-trips through the host and arrives back here.
    accessor.echoWrites = true;
    host.value.set('echoed');
    fixture.detectChanges();
    host.value.set(host.seen[host.seen.length - 1]);
    fixture.detectChanges();
    expect(accessor.writes).toEqual(['first', 'echoed']);
    expect(host.seen).toEqual(['echoed']);
  });
});
