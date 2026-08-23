/**
 * Fixed-height windowed list. Only the rows in view plus a small overscan are
 * in the DOM, so a column holding a few thousand cards costs the same as one
 * holding twenty.
 */
export function virtualList({ scroller, inner, count, rowHeight, gap = 0, overscan = 6, render }) {
  const stride = rowHeight + gap;
  inner.style.height = `${Math.max(0, count * stride - gap)}px`;

  let first = -1;
  let last = -1;
  const mounted = new Map();

  function paint() {
    const top = scroller.scrollTop;
    const height = scroller.clientHeight || 1;
    const from = Math.max(0, Math.floor(top / stride) - overscan);
    const to = Math.min(count - 1, Math.ceil((top + height) / stride) + overscan);

    if (from === first && to === last) return;
    first = from;
    last = to;

    for (const [index, node] of mounted) {
      if (index < from || index > to) {
        node.remove();
        mounted.delete(index);
      }
    }
    for (let index = from; index <= to; index++) {
      if (mounted.has(index)) continue;
      const node = render(index);
      if (!node) continue;
      node.style.top = `${index * stride}px`;
      inner.append(node);
      mounted.set(index, node);
    }
  }

  scroller.addEventListener("scroll", paint, { passive: true });
  paint();

  return {
    repaint() {
      first = -1;
      last = -1;
      for (const node of mounted.values()) node.remove();
      mounted.clear();
      paint();
    },
    destroy() {
      scroller.removeEventListener("scroll", paint);
      mounted.clear();
    },
    /** Rows actually in the DOM right now — the board footer reports this. */
    window() {
      return { from: first + 1, to: Math.min(last + 1, count), count };
    },
  };
}
