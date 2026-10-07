import type { DiaperEvent } from '../domain/diaper-event';

export interface DiaperRepository {
  save(event: DiaperEvent): Promise<void>;
  getById(childId: string, id: string): Promise<DiaperEvent | null>;
  listRecentByChildId(childId: string, limit: number): Promise<readonly DiaperEvent[]>;
  deleteIfMatches(expected: DiaperEvent): Promise<boolean>;
  updateIfMatches(expected: DiaperEvent, replacement: DiaperEvent): Promise<boolean>;
}
