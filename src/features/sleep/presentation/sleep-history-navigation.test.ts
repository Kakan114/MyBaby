import { describe, expect, it, vi } from 'vitest';
import { sv } from '../../../i18n/locales/sv';
import { openSleepHistory } from './sleep-history-navigation';

describe('Sleep history navigation', () => {
  it('opens the dedicated Sleep history route', () => {
    const navigate = vi.fn();
    openSleepHistory(navigate);
    expect(navigate).toHaveBeenCalledWith('/sleep-history');
  });

  it('defines resolved Swedish history labels', () => {
    expect(sv.sleep.history.open).toBe('Visa sömnhistorik');
    expect(sv.sleep.history.title).toBe('Sömnhistorik');
  });
});
