import { describe, expect, it, vi } from 'vitest';
import { openDiaperHistory } from './diaper-history-navigation';

describe('Diaper history navigation', () => {
  it('clears transient Undo before opening the dedicated history route', () => {
    const order: string[] = [];
    const clear = vi.fn(() => order.push('clear'));
    const navigate = vi.fn(() => order.push('navigate'));
    openDiaperHistory(clear, navigate);
    expect(navigate).toHaveBeenCalledWith('/diaper-history');
    expect(order).toEqual(['clear', 'navigate']);
  });

});
