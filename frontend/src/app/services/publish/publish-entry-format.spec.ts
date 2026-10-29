import { describe, expect, it } from 'vitest';

import {
  packFieldRows,
  printBackground,
  splitLongText,
  statBlockLeadIn,
  typstLinearGradient,
} from './publish-entry-format';

describe('packFieldRows', () => {
  it('starts a field that does not fit on a new row', () => {
    expect(packFieldRows([8, 6])).toEqual([0, 4]);
  });

  it('keeps a run of same-width fields together on a fresh row', () => {
    // Speed (3) then six ability scores (2 each): the scores start a new row
    // rather than splitting four and two.
    expect(packFieldRows([3, 2, 2, 2, 2, 2, 2])).toEqual([0, 9, 0, 0, 0, 0, 0]);
  });

  it('lets a run too wide for one row follow on as usual', () => {
    expect(packFieldRows([6, 4, 4, 4, 4])).toEqual([0, 0, 2, 0, 0]);
  });

  it('packs full-width fields one per row', () => {
    expect(packFieldRows([12, 12])).toEqual([0, 0]);
  });
});

describe('statBlockLeadIn', () => {
  it('splits a stat-block name from its text', () => {
    expect(
      statBlockLeadIn('Gaff Hook. Melee Weapon Attack: +3 to hit.')
    ).toEqual({
      name: 'Gaff Hook.',
      rest: 'Melee Weapon Attack: +3 to hit.',
    });
    expect(
      statBlockLeadIn('Drown (Recharge 5-6). One creature grappled…')
    )?.toBeTruthy();
    expect(statBlockLeadIn('The Black Tide. On the night…')?.name).toBe(
      'The Black Tide.'
    );
  });

  it('leaves ordinary sentences alone', () => {
    expect(statBlockLeadIn('He left. Then the tide came in.')).toBeNull();
    expect(
      statBlockLeadIn(
        'Requires attunement by a creature that has drowned and returned. Lit, it shines.'
      )
    ).toBeNull();
    expect(statBlockLeadIn('No full stop here')).toBeNull();
  });
});

describe('splitLongText', () => {
  it('leaves a single-line value alone', () => {
    expect(splitLongText('Just one line.')).toBeNull();
  });

  it('splits lines into paragraphs, bullets and lead-ins', () => {
    expect(
      splitLongText('Gaff Hook. Melee attack.\n\n- first\n• second\nplain')
    ).toEqual([
      { kind: 'paragraph', lead: 'Gaff Hook.', text: 'Melee attack.' },
      { kind: 'bullet', text: 'first' },
      { kind: 'bullet', text: 'second' },
      { kind: 'paragraph', text: 'plain' },
    ]);
  });
});

describe('printBackground', () => {
  it('is null without a setting or value', () => {
    expect(printBackground(undefined)).toBeNull();
    expect(printBackground({ type: 'color', mode: 'auto' })).toBeNull();
  });

  it('lightens an auto colour as the editor does in the light theme', () => {
    // Intensity 50 lightens by 0.25 of the way to white.
    expect(
      printBackground({
        type: 'color',
        mode: 'auto',
        value: '#000000',
        intensity: 50,
      })
    ).toEqual({ type: 'color', color: '#404040' });
  });

  it('uses the light value of a manual setting unchanged', () => {
    expect(
      printBackground({
        type: 'color',
        mode: 'manual',
        light: '#f4ecd8',
        dark: '#222222',
      })
    ).toEqual({ type: 'color', color: '#f4ecd8' });
  });

  it('lightens the stops of an auto gradient and passes images through', () => {
    const gradient = printBackground({
      type: 'gradient',
      mode: 'auto',
      value: 'linear-gradient(180deg, #000000 0%, #000000 100%)',
      intensity: 0,
    });
    expect(gradient).toEqual({
      type: 'gradient',
      css: 'linear-gradient(180deg, #000000 0%, #000000 100%)',
    });
    expect(
      printBackground({ type: 'image', mode: 'auto', value: 'media://x.png' })
    ).toEqual({ type: 'image', src: 'media://x.png' });
  });

  it('refuses a gradient that is not linear', () => {
    expect(
      printBackground({
        type: 'gradient',
        mode: 'manual',
        light: 'radial-gradient(#fff, #000)',
      })
    ).toBeNull();
  });
});

describe('typstLinearGradient', () => {
  it('converts angle and positioned stops', () => {
    expect(
      typstLinearGradient('linear-gradient(160deg, #f4ecd8 0%, #cdb894 100%)')
    ).toBe(
      'gradient.linear((rgb("#f4ecd8"), 0%), (rgb("#cdb894"), 100%), angle: 70deg)'
    );
  });

  it('understands "to" directions and unpositioned stops', () => {
    expect(typstLinearGradient('linear-gradient(to right, #fff, #000)')).toBe(
      'gradient.linear(rgb("#fff"), rgb("#000"), angle: 0deg)'
    );
    expect(
      typstLinearGradient('linear-gradient(to bottom, #fff 0%, #000)')
    ).toBe('gradient.linear(rgb("#fff"), rgb("#000"), angle: 90deg)');
  });

  it('refuses anything it cannot express safely', () => {
    expect(typstLinearGradient('linear-gradient(red, blue)')).toBeNull();
    expect(typstLinearGradient('linear-gradient(90deg, #fff)')).toBeNull();
    expect(typstLinearGradient('url(evil)')).toBeNull();
  });
});
