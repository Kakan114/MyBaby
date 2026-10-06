import type { FeedingEvent } from '../domain/feeding-event';
import type { FeedingRepository } from './feeding-repository';

export const RECENT_FEEDING_LIMIT = 20;

export class FeedingHistoryApplicationError extends Error {
  readonly code = 'invalid-child-id' as const;

  constructor() {
    super('A valid child ID is required to list feeding history.');
    this.name = 'FeedingHistoryApplicationError';
  }
}

export async function listRecentFeedings(
  repository: FeedingRepository,
  childId: string,
): Promise<readonly FeedingEvent[]> {
  if (childId.trim().length === 0) {
    throw new FeedingHistoryApplicationError();
  }

  return repository.listRecentByChildId(childId, RECENT_FEEDING_LIMIT);
}
