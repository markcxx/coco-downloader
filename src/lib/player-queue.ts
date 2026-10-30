export type PlayMode = 'order' | 'shuffle' | 'single';

export function queueOrder(length: number, current: number, mode: PlayMode): number[] {
  const order = Array.from({ length }, (_, index) => index);
  if (mode !== 'shuffle') return order;
  const remaining = order.filter(index => index !== current);
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  return current >= 0 && current < length ? [current, ...remaining] : remaining;
}

export function adjacentIndex(order: number[], current: number, direction: 1 | -1): number {
  const position = order.indexOf(current);
  return position < 0 ? -1 : (order[position + direction] ?? -1);
}
