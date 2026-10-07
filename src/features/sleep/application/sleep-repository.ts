import type { ActiveSleepSession, SleepEvent } from '../domain/sleep';

export interface SleepRepository {
  getActiveByChildId(childId: string): Promise<ActiveSleepSession | null>;
  getEventById(childId: string, id: string): Promise<SleepEvent | null>;
  saveCompleted(event: SleepEvent): Promise<void>;
  createActive(session: ActiveSleepSession): Promise<void>;
  complete(session: ActiveSleepSession, event: SleepEvent): Promise<void>;
  discard(childId: string, sessionId: string): Promise<void>;
  listRecentByChildId(childId: string, limit: number): Promise<readonly SleepEvent[]>;
}
