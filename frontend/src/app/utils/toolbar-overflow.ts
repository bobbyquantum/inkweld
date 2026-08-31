/**
 * Toolbar overflow arithmetic.
 *
 * A toolbar that is wider than its container should not scroll sideways or
 * clip: lower-priority groups drop out of the row and reappear under a "more"
 * chevron. This is the measuring half of that — pure arithmetic over widths
 * that have already been measured, so it can be reasoned about and tested
 * without a layout engine.
 *
 * The DOM half (reading widths, watching for resizes) belongs to the component
 * that owns the toolbar.
 */

/** Each group occupies two flex children: the group itself and its divider. */
export const CHILDREN_PER_GROUP = 2;

export interface ToolbarOverflowInput {
  /**
   * Width the groups may occupy: the container's inner width, less anything
   * reserved (the chevron button, pinned controls).
   */
  availableWidth: number;
  /** Flex `gap` between toolbar children, in pixels. */
  gapPx: number;
  /**
   * Group names, highest priority first — so the last entry is the first to
   * be pushed into the overflow menu.
   */
  priority: readonly string[];
  /** Natural width of each group, including its divider. */
  widths: ReadonlyMap<string, number>;
}

/**
 * Work out which groups have to move into the overflow menu.
 *
 * Returns an empty set when everything fits, or when no widths have been
 * measured yet — hiding groups on the strength of a zero measurement would
 * make the toolbar flicker on first paint.
 */
export function computeOverflowGroups(
  input: ToolbarOverflowInput
): Set<string> {
  const { availableWidth, gapPx, priority, widths } = input;
  const overflow = new Set<string>();

  let total = 0;
  for (const name of priority) total += widths.get(name) ?? 0;
  if (total === 0) return overflow;

  // Every child is separated from the next by one gap.
  const gapCount = Math.max(priority.length * CHILDREN_PER_GROUP - 1, 0);
  let remaining = total + gapPx * gapCount;

  if (remaining <= availableWidth) return overflow;

  for (let i = priority.length - 1; i >= 0; i--) {
    if (remaining <= availableWidth) break;
    const name = priority[i];
    overflow.add(name);
    // Hiding a group removes it, its divider, and the two gaps around them.
    remaining -= (widths.get(name) ?? 0) + gapPx * CHILDREN_PER_GROUP;
  }

  return overflow;
}

/** Whether two overflow sets hold the same groups. */
export function sameOverflow(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>
): boolean {
  return a.size === b.size && [...a].every(name => b.has(name));
}

/** An element's laid-out width including horizontal margins. */
export function measuredWidth(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = getComputedStyle(element);
  const margins =
    (Number.parseFloat(style.marginLeft) || 0) +
    (Number.parseFloat(style.marginRight) || 0);
  return element.offsetWidth + margins;
}

/** Horizontal padding of an element, used to find its inner width. */
export function horizontalPadding(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return (
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0)
  );
}
