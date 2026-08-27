/** Minimal rectangle shape (a `DOMRect` satisfies this). */
export interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Computed fixed-position coordinates for the step card. */
export interface CardPosition {
  top: number;
  left: number;
}

/** Gap kept between the anchor, the card, and the viewport edges. */
export const CARD_MARGIN = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Place the step card relative to its anchor: below when it fits, then above,
 * then beside (right, then left), always clamped inside the viewport.
 */
export function computeCardPosition(
  anchor: RectLike,
  card: { width: number; height: number },
  viewport: { width: number; height: number }
): CardPosition {
  const anchorBottom = anchor.top + anchor.height;
  const anchorRight = anchor.left + anchor.width;

  const clampLeft = (left: number): number =>
    clamp(left, CARD_MARGIN, viewport.width - card.width - CARD_MARGIN);
  const clampTop = (top: number): number =>
    clamp(top, CARD_MARGIN, viewport.height - card.height - CARD_MARGIN);

  const fitsBelow =
    anchorBottom + CARD_MARGIN + card.height + CARD_MARGIN <= viewport.height;
  if (fitsBelow) {
    return {
      top: anchorBottom + CARD_MARGIN,
      left: clampLeft(anchor.left + anchor.width / 2 - card.width / 2),
    };
  }

  const fitsAbove = anchor.top - CARD_MARGIN - card.height >= CARD_MARGIN;
  if (fitsAbove) {
    return {
      top: anchor.top - CARD_MARGIN - card.height,
      left: clampLeft(anchor.left + anchor.width / 2 - card.width / 2),
    };
  }

  // Anchors that dominate the viewport (e.g. the whole content area): center
  // the card inside the anchor rather than squeezing it against an edge.
  const fitsInside =
    anchor.width >= card.width + CARD_MARGIN * 2 &&
    anchor.height >= card.height + CARD_MARGIN * 2;
  if (fitsInside) {
    return {
      top: clampTop(anchor.top + anchor.height / 2 - card.height / 2),
      left: clampLeft(anchor.left + anchor.width / 2 - card.width / 2),
    };
  }

  // Beside the anchor: prefer the right, fall back to the left.
  const top = clampTop(anchor.top + anchor.height / 2 - card.height / 2);
  const fitsRight =
    anchorRight + CARD_MARGIN + card.width + CARD_MARGIN <= viewport.width;
  const left = fitsRight
    ? anchorRight + CARD_MARGIN
    : anchor.left - CARD_MARGIN - card.width;
  return { top, left: clampLeft(left) };
}
