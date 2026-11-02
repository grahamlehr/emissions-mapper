// Pure geometry for map labels. No DOM access, so it can be tested with node:test.

// Rects are { left, top, right, bottom } in the same coordinate space. Rects that
// only touch along an edge do not count as overlapping.
export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function inflateRect(rect, margin) {
  return {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin
  };
}

// Greedy label placement. Items are { id, rect, priority } where a lower priority number
// wins. Returns the Set of ids whose labels stay visible. Ties keep input order.
// Empty rects (zero width or height, e.g. hidden elements) are always kept.
export function pickVisibleLabels(items, { margin = 0 } = {}) {
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.priority - b.item.priority || a.index - b.index);
  const kept = new Set();
  const keptRects = [];
  for (const { item } of ordered) {
    const rect = inflateRect(item.rect, margin);
    if (keptRects.some((other) => rectsOverlap(rect, other))) continue;
    kept.add(item.id);
    keptRects.push(rect);
  }
  return kept;
}

// Padding for Leaflet's panInside so a point clears an overlay card. `card` and `container`
// are rects in viewport coordinates. If the card covers the container's bottom-right corner
// the padding clears it; otherwise a small uniform padding is used.
export function panPadding(container, card, { gap = 24, fallback = 40 } = {}) {
  const overlap = card && rectsOverlap(card, container);
  if (!overlap) return { topLeft: [fallback, fallback], bottomRight: [fallback, fallback] };
  const width = container.right - Math.max(card.left, container.left);
  const height = container.bottom - Math.max(card.top, container.top);
  return {
    topLeft: [fallback, fallback],
    bottomRight: [Math.max(fallback, width + gap), Math.max(fallback, height + gap)]
  };
}
