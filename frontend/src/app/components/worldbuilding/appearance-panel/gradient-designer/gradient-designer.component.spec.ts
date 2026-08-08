import { describe, expect, it } from 'vitest';

import {
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
