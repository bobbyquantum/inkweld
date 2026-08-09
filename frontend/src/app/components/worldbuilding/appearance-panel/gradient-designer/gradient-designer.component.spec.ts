import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import {
  GradientDesignerComponent,
  type GradientStop,
  parseGradient,
  serializeGradient,
} from './gradient-designer.component';

describe('gradient parse/serialize', () => {
  it('should parse a simple two-stop gradient', () => {
    const parsed = parseGradient(
      'linear-gradient(135deg, #97f0ff 0%, #ffffff 100%)'
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.angle).toBe(135);
    expect(parsed!.stops).toEqual([
      { color: '#97f0ff', position: 0 },
      { color: '#ffffff', position: 100 },
    ]);
  });

  it('should default the angle to 180 when omitted', () => {
    const parsed = parseGradient('linear-gradient(#000, #fff)');
    expect(parsed!.angle).toBe(180);
  });

  it('should spread stops evenly when no positions are given', () => {
    const parsed = parseGradient('linear-gradient(#000, #888, #fff)');
    expect(parsed!.stops.map(s => s.position)).toEqual([0, 50, 100]);
  });

  it('should return null for a non-gradient value', () => {
    expect(parseGradient('#4fd8eb')).toBeNull();
    expect(parseGradient('')).toBeNull();
  });

  it('should serialize stops and angle back to a gradient string', () => {
    const stops: GradientStop[] = [
      { color: '#97f0ff', position: 0 },
      { color: '#ffffff', position: 100 },
    ];
    expect(serializeGradient(stops, 135)).toBe(
      'linear-gradient(135deg, #97f0ff 0%, #ffffff 100%)'
    );
  });
});

describe('GradientDesignerComponent', () => {
  let component: GradientDesignerComponent;
  let fixture: ComponentFixture<GradientDesignerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GradientDesignerComponent, translocoTestProvider()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(GradientDesignerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', '');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to two stops and 180deg for an empty value', () => {
    fixture.detectChanges();
    expect(component['stops']().length).toBe(2);
    expect(component['angle']()).toBe(180);
  });

  it('should sync stops and angle from a parsed value', () => {
    fixture.componentRef.setInput(
      'value',
      'linear-gradient(135deg, #97f0ff 0%, #ffffff 100%)'
    );
    fixture.detectChanges();
    expect(component['stops']()).toEqual([
      { color: '#97f0ff', position: 0 },
      { color: '#ffffff', position: 100 },
    ]);
    expect(component['angle']()).toBe(135);
  });

  it('should emit a preview on change', () => {
    fixture.detectChanges();
    const emit = vi.fn();
    component.valueChange.subscribe(emit);
    component['emit']();
    expect(emit).toHaveBeenCalledWith(
      'linear-gradient(180deg, #4fd8eb 0%, #ffffff 100%)'
    );
  });

  it('should update the angle from the slider', () => {
    fixture.detectChanges();
    component['onAngleInput']({
      target: { value: '45' },
    } as unknown as Event);
    expect(component['angle']()).toBe(45);
  });

  it('should select a stop by index', () => {
    component['selectStop'](1);
    expect(component['selectedIndex']()).toBe(1);
  });

  it('should drag a stop to the pointer position on pointerdown', () => {
    fixture.detectChanges();
    const el = {
      setPointerCapture: vi.fn(),
      closest: () => ({
        getBoundingClientRect: () => ({ left: 0, width: 100 }),
      }),
    } as unknown as HTMLElement;
    component['onStopPointerDown'](0, {
      pointerId: 1,
      clientX: 50,
      currentTarget: el,
    } as unknown as PointerEvent);
    expect(component['stops']()[0].position).toBe(50);
  });

  it('should move the dragged stop while the pointer moves', () => {
    fixture.detectChanges();
    const el = {
      setPointerCapture: vi.fn(),
      closest: () => ({
        getBoundingClientRect: () => ({ left: 0, width: 100 }),
      }),
    } as unknown as HTMLElement;
    component['onStopPointerDown'](0, {
      pointerId: 1,
      clientX: 0,
      currentTarget: el,
    } as unknown as PointerEvent);
    component['onStopPointerMove']({
      clientX: 80,
      currentTarget: el,
    } as unknown as PointerEvent);
    expect(component['stops']()[0].position).toBe(80);
  });

  it('should stop dragging on pointerup', () => {
    fixture.detectChanges();
    const el = {
      setPointerCapture: vi.fn(),
      closest: () => ({
        getBoundingClientRect: () => ({ left: 0, width: 100 }),
      }),
    } as unknown as HTMLElement;
    component['onStopPointerDown'](0, {
      pointerId: 1,
      clientX: 0,
      currentTarget: el,
    } as unknown as PointerEvent);
    component['onStopPointerUp']({
      currentTarget: el,
    } as unknown as PointerEvent);
    const before = component['stops']()[0].position;
    component['onStopPointerMove']({
      clientX: 90,
      currentTarget: el,
    } as unknown as PointerEvent);
    expect(component['stops']()[0].position).toBe(before);
  });

  it('should update a stop colour from the chooser', () => {
    fixture.detectChanges();
    component['onStopColorChange'](0, '#ff0000');
    expect(component['stops']()[0].color).toBe('#ff0000');
  });

  it('should ignore an invalid stop colour', () => {
    fixture.detectChanges();
    component['onStopColorChange'](0, 'nope');
    expect(component['stops']()[0].color).toBe('#4fd8eb');
  });

  it('should add a stop at the midpoint', () => {
    fixture.detectChanges();
    component['addStop']();
    expect(component['stops']().length).toBe(3);
    expect(component['stops']()[2].position).toBe(50);
  });

  it('should not remove a stop when there are only two', () => {
    fixture.detectChanges();
    component['removeStop']();
    expect(component['stops']().length).toBe(2);
  });

  it('should remove the selected stop when there are more than two', () => {
    fixture.detectChanges();
    component['addStop']();
    component['selectStop'](1);
    component['removeStop']();
    expect(component['stops']().length).toBe(2);
  });
});
