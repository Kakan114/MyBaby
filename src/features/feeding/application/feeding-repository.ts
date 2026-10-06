import type { FeedingEvent } from '../domain/feeding-event';

export interface FeedingRepository {
  save(event: FeedingEvent): Promise<void>;
}
