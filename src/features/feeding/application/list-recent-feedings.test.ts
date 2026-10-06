import { describe, expect, it, vi } from 'vitest';

import type { FeedingRepository } from './feeding-repository';
import {
  FeedingHistoryApplicationError,
  listRecentFeedings,
  RECENT_FEEDING_LIMIT,
} from './list-recent-feedings';

function repository(): FeedingRepository {
  return {
    listRecentByChildId: vi.fn(async () => []),
    save: vi.fn(async () => undefined),
  };
}

describe('listRecentFeedings', () => {
  it('requests the product-owned recent limit for the selected child', async () => {
    const feedingRepository = repository();

    await expect(listRecentFeedings(feedingRepository, 'child-1')).resolves.toEqual([]);
    expect(feedingRepository.listRecentByChildId).toHaveBeenCalledWith(
      'child-1',
      RECENT_FEEDING_LIMIT,
    );
    expect(RECENT_FEEDING_LIMIT).toBe(20);
  });

  it('rejects a blank child ID before accessing persistence', async () => {
    const feedingRepository = repository();

    await expect(listRecentFeedings(feedingRepository, '  ')).rejects.toBeInstanceOf(
      FeedingHistoryApplicationError,
    );
    expect(feedingRepository.listRecentByChildId).not.toHaveBeenCalled();
  });
});
