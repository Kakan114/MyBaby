import {
  createFeedingEvent,
  type FeedingDetails,
  type FeedingEvent,
} from '../domain/feeding-event';
import type { FeedingIdGenerator } from './feeding-id-generator';
import type { FeedingRepository } from './feeding-repository';

export type RecordFeedingDependencies = Readonly<{
  feedingIdGenerator: FeedingIdGenerator;
  feedingRepository: FeedingRepository;
}>;

export async function recordFeeding(
  dependencies: RecordFeedingDependencies,
  childId: string,
  occurredAtEpochMs: number,
  details: FeedingDetails,
): Promise<FeedingEvent> {
  const event = createFeedingEvent({
    ...details,
    id: dependencies.feedingIdGenerator.generate(),
    childId,
    occurredAtEpochMs,
  });

  await dependencies.feedingRepository.save(event);
  return event;
}
