import { describe, expect, it, vi } from 'vitest';
import { createDiaperDeleteConfirmationActions } from './diaper-delete-confirmation';

describe('diaper delete confirmation', () => {
  it('keeps cancel non-mutating and exposes only an explicit destructive confirmation', () => {
    const remove = vi.fn();
    const actions = createDiaperDeleteConfirmationActions(
      { cancel: 'Avbryt', confirm: 'Ta bort' },
      remove,
    );
    expect(actions[0]).toEqual({ text: 'Avbryt', style: 'cancel' });
    expect(remove).not.toHaveBeenCalled();
    actions[1]?.onPress?.();
    expect(actions[1]?.style).toBe('destructive');
    expect(remove).toHaveBeenCalledOnce();
  });
});
