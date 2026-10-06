import type { BreastFeedingEvent } from '../domain/feeding-event';
import type { BreastfeedingTimerSession } from '../domain/breastfeeding-timer';

export interface BreastfeedingTimerRepository {
  get(): Promise<BreastfeedingTimerSession | null>;
  create(session: BreastfeedingTimerSession): Promise<void>;
  replace(session: BreastfeedingTimerSession): Promise<void>;
  discard(sessionId: string): Promise<void>;
  complete(sessionId: string, event: BreastFeedingEvent): Promise<void>;
}
