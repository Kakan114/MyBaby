import type { CalendarDate } from '../../children/domain/calendar-date';
import type { MilestoneEntry } from '../domain/milestone-entry';

export type MilestoneHistoryCursor = Readonly<{
  childId: string;
  occurredOn: CalendarDate;
  id: string;
}>;

export type MilestoneHistoryPage = Readonly<{
  items: readonly MilestoneEntry[];
  nextCursor: MilestoneHistoryCursor | null;
}>;

export interface MilestoneRepository {
  create(entry: MilestoneEntry): Promise<void>;
  getById(childId: string, id: string): Promise<MilestoneEntry | null>;
  listHistory(
    childId: string,
    limit: number,
    before?: MilestoneHistoryCursor | null,
  ): Promise<MilestoneHistoryPage>;
  updateIfMatches(expected: MilestoneEntry, replacement: MilestoneEntry): Promise<boolean>;
  deleteIfMatches(expected: MilestoneEntry): Promise<boolean>;
}

