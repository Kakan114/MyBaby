import type { Reminder } from '../domain/reminder';

export type ReminderCursor = Readonly<{
  childId: string;
  scheduledAtEpochMs: number;
  id: string;
}>;

export type ReminderPage = Readonly<{
  items: readonly Reminder[];
  nextCursor: ReminderCursor | null;
}>;

export interface ReminderRepository {
  create(reminder: Reminder): Promise<void>;
  getById(childId: string, id: string): Promise<Reminder | null>;
  listByChild(
    childId: string,
    limit: number,
    before?: ReminderCursor | null,
  ): Promise<ReminderPage>;
  /** Future reminders only, in ascending instant/ID order. */
  listUpcomingByChild(
    childId: string,
    afterEpochMs: number,
    limit: number,
    after?: ReminderCursor | null,
  ): Promise<ReminderPage>;
  /** Passed reminders only, in descending instant/ID order. */
  listPastByChild(
    childId: string,
    atOrBeforeEpochMs: number,
    limit: number,
    before?: ReminderCursor | null,
  ): Promise<ReminderPage>;
  updateIfMatches(expected: Reminder, replacement: Reminder): Promise<boolean>;
  deleteIfMatches(expected: Reminder): Promise<boolean>;
}
