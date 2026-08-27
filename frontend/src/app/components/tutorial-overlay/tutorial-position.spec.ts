import { describe, expect, it } from 'vitest';

import { CARD_MARGIN, computeCardPosition } from './tutorial-position';

const VIEWPORT = { width: 1000, height: 800 };
const CARD = { width: 300, height: 200 };

describe('computeCardPosition', () => {
  it('places the card below the anchor when there is room', () => {
    const anchor = { top: 100, left: 400, width: 100, height: 40 };

    const pos = computeCardPosition(anchor, CARD, VIEWPORT);

    expect(pos.top).toBe(100 + 40 + CARD_MARGIN);
    // Horizontally centered on the anchor
    expect(pos.left).toBe(400 + 50 - 150);
  });

  it('places the card above the anchor when there is no room below', () => {
    const anchor = { top: 700, left: 400, width: 100, height: 60 };

    const pos = computeCardPosition(anchor, CARD, VIEWPORT);

    expect(pos.top).toBe(700 - CARD_MARGIN - CARD.height);
  });

  it('places the card beside a tall anchor filling the viewport height', () => {
    const anchor = { top: 0, left: 0, width: 250, height: 800 };

    const pos = computeCardPosition(anchor, CARD, VIEWPORT);

    // To the right of the anchor, vertically centered and clamped
    expect(pos.left).toBe(250 + CARD_MARGIN);
    expect(pos.top).toBe(800 / 2 - CARD.height / 2);
  });

  it('centers the card inside an anchor that dominates the viewport', () => {
    const anchor = { top: 50, left: 100, width: 800, height: 700 };

    const pos = computeCardPosition(anchor, CARD, VIEWPORT);

    expect(pos.left).toBe(100 + 400 - CARD.width / 2);
    expect(pos.top).toBe(50 + 350 - CARD.height / 2);
  });

  it('falls back to the left side when there is no room on the right', () => {
    const anchor = { top: 0, left: 700, width: 300, height: 800 };

    const pos = computeCardPosition(anchor, CARD, VIEWPORT);

    expect(pos.left).toBe(700 - CARD_MARGIN - CARD.width);
  });

  it('clamps horizontally for anchors at the viewport edge', () => {
    const anchor = { top: 100, left: 950, width: 40, height: 40 };

    const pos = computeCardPosition(anchor, CARD, VIEWPORT);

    expect(pos.left).toBe(VIEWPORT.width - CARD.width - CARD_MARGIN);
  });

  it('never returns coordinates above or left of the margin', () => {
    const anchor = { top: 0, left: 0, width: 10, height: 790 };

    const pos = computeCardPosition(anchor, CARD, VIEWPORT);

    expect(pos.top).toBeGreaterThanOrEqual(CARD_MARGIN);
    expect(pos.left).toBeGreaterThanOrEqual(CARD_MARGIN);
  });
});
