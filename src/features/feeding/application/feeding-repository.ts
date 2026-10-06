import type { FeedingEvent } from '../domain/feeding-event';

export interface FeedingRepository {
  listRecentByChildId(
    childId: string,
    limit: number,
  ): Promise<readonly FeedingEvent[]>;
  save(event: FeedingEvent): Promise<void>;
}
