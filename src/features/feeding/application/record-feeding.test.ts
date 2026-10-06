import { describe, expect, it, vi } from 'vitest';

import type { FeedingEvent } from '../domain/feeding-event';
import { recordFeeding } from './record-feeding';

describe('record feeding', () => {
  it('owns generated identity, child ownership, and timestamp', async () => {
    const save = vi.fn(async (_event: FeedingEvent) => undefined);
    const event = await recordFeeding(
      {
        feedingIdGenerator: { generate: () => 'generated-feeding-id' },
        feedingRepository: { save },
      },
      'active-child',
      1_765_000_000_123,
      { kind: 'breast', leftDurationSeconds: 300, rightDurationSeconds: 0 },
    );

    expect(event).toEqual({
      id: 'generated-feeding-id',
      childId: 'active-child',
      occurredAtEpochMs: 1_765_000_000_123,
      kind: 'breast',
      leftDurationSeconds: 300,
      rightDurationSeconds: 0,
    });
    expect(save).toHaveBeenCalledWith(event);
  });

  it('does not persist an invalid event', async () => {
    const save = vi.fn(async (_event: FeedingEvent) => undefined);

    await expect(recordFeeding(
      {
        feedingIdGenerator: { generate: () => 'feeding-id' },
        feedingRepository: { save },
      },
      'child-id',
      123,
      { kind: 'breast', leftDurationSeconds: 0, rightDurationSeconds: 0 },
    )).rejects.toMatchObject({ code: 'invalid-duration' });
    expect(save).not.toHaveBeenCalled();
  });
});
