import type {
  ReminderCursor,
  ReminderPage,
  ReminderRepository,
} from '../application/reminder-repository';
import {
  createReminder,
  type Reminder,
} from '../domain/reminder';

type BindValue = string | number | null;

export interface ReminderDatabase {
  getFirstAsync<T>(sql: string, params: BindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: BindValue[]): Promise<T[]>;
  runAsync(sql: string, params: BindValue[]): Promise<Readonly<{ changes: number }>>;
}

type ReminderRow = Readonly<{
  id: unknown;
  child_id: unknown;
  title: unknown;
  scheduled_at_epoch_ms: unknown;
  revision: unknown;
}>;

const columns = 'id, child_id, title, scheduled_at_epoch_ms, revision';

function assertIdentity(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid Reminder identity.');
  }
}

function assertPageSize(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid Reminder page size.');
  }
}

function assertEpoch(value: number): void {
  createReminder({
    id: 'epoch-validation',
    childId: 'epoch-validation',
    title: 'epoch-validation',
    scheduledAtEpochMs: value,
    revision: 1,
  });
}

function mapRow(row: ReminderRow, childId: string): Reminder {
  if (
    typeof row.id !== 'string' ||
    typeof row.child_id !== 'string' ||
    row.child_id !== childId ||
    typeof row.title !== 'string' ||
    typeof row.scheduled_at_epoch_ms !== 'number' ||
    typeof row.revision !== 'number'
  ) {
    throw new Error('Invalid persisted Reminder row.');
  }
  const reminder = createReminder({
    id: row.id,
    childId: row.child_id,
    title: row.title,
    scheduledAtEpochMs: row.scheduled_at_epoch_ms,
    revision: row.revision,
  });
  if (reminder.title !== row.title) {
    throw new Error('Persisted Reminder title is not canonical.');
  }
  return reminder;
}

function values(reminder: Reminder): BindValue[] {
  return [
    reminder.id,
    reminder.childId,
    reminder.title,
    reminder.scheduledAtEpochMs,
    reminder.revision,
  ];
}

/** Uses the caller's connection; serialization and reconciliation belong to runtime/application. */
export class SqliteReminderRepository implements ReminderRepository {
  constructor(private readonly database: ReminderDatabase) {}

  async create(input: Reminder): Promise<void> {
    const reminder = createReminder(input);
    if (reminder.revision !== 1) {
      throw new Error('New Reminder entries require revision 1.');
    }
    await this.database.runAsync(
      `INSERT INTO reminders (${columns}) VALUES (?, ?, ?, ?, ?);`,
      values(reminder),
    );
  }

  async getById(childId: string, id: string): Promise<Reminder | null> {
    assertIdentity(childId);
    assertIdentity(id);
    const row = await this.database.getFirstAsync<ReminderRow>(
      `SELECT ${columns} FROM reminders WHERE child_id = ? AND id = ?;`,
      [childId, id],
    );
    return row === null ? null : mapRow(row, childId);
  }

  async listByChild(
    childId: string,
    limit: number,
    before: ReminderCursor | null = null,
  ): Promise<ReminderPage> {
    assertIdentity(childId);
    assertPageSize(limit);
    const params: BindValue[] = [childId];
    let boundary = '';
    if (before !== null) {
      assertIdentity(before.id);
      if (before.childId !== childId) {
        throw new Error('Reminder cursor ownership mismatch.');
      }
      const validated = createReminder({
        id: before.id,
        childId: before.childId,
        title: 'cursor',
        scheduledAtEpochMs: before.scheduledAtEpochMs,
        revision: 1,
      });
      boundary = ' AND (scheduled_at_epoch_ms > ? OR (scheduled_at_epoch_ms = ? AND id > ?))';
      params.push(validated.scheduledAtEpochMs, validated.scheduledAtEpochMs, validated.id);
    }
    params.push(limit + 1);
    const rows = await this.database.getAllAsync<ReminderRow>(
      `SELECT ${columns} FROM reminders WHERE child_id = ?${boundary} ` +
        'ORDER BY scheduled_at_epoch_ms ASC, id ASC LIMIT ?;',
      params,
    );
    const mapped = rows.map((row) => mapRow(row, childId));
    const items = mapped.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: mapped.length > limit && last
        ? { childId, scheduledAtEpochMs: last.scheduledAtEpochMs, id: last.id }
        : null,
    };
  }

  async listUpcomingByChild(
    childId: string,
    afterEpochMs: number,
    limit: number,
    after: ReminderCursor | null = null,
  ): Promise<ReminderPage> {
    assertIdentity(childId);
    assertEpoch(afterEpochMs);
    assertPageSize(limit);
    const params: BindValue[] = [childId, afterEpochMs];
    let boundary = '';
    if (after !== null) {
      assertIdentity(after.id);
      assertEpoch(after.scheduledAtEpochMs);
      if (after.childId !== childId || after.scheduledAtEpochMs <= afterEpochMs) {
        throw new Error('Reminder cursor ownership or boundary mismatch.');
      }
      boundary = ' AND (scheduled_at_epoch_ms > ? OR (scheduled_at_epoch_ms = ? AND id > ?))';
      params.push(after.scheduledAtEpochMs, after.scheduledAtEpochMs, after.id);
    }
    params.push(limit + 1);
    const rows = await this.database.getAllAsync<ReminderRow>(
      `SELECT ${columns} FROM reminders ` +
        `WHERE child_id = ? AND scheduled_at_epoch_ms > ?${boundary} ` +
        'ORDER BY scheduled_at_epoch_ms ASC, id ASC LIMIT ?;',
      params,
    );
    const mapped = rows.map((row) => mapRow(row, childId));
    const items = mapped.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: mapped.length > limit && last
        ? { childId, scheduledAtEpochMs: last.scheduledAtEpochMs, id: last.id }
        : null,
    };
  }

  async listPastByChild(
    childId: string,
    atOrBeforeEpochMs: number,
    limit: number,
    before: ReminderCursor | null = null,
  ): Promise<ReminderPage> {
    assertIdentity(childId);
    assertEpoch(atOrBeforeEpochMs);
    assertPageSize(limit);
    const params: BindValue[] = [childId, atOrBeforeEpochMs];
    let boundary = '';
    if (before !== null) {
      assertIdentity(before.id);
      assertEpoch(before.scheduledAtEpochMs);
      if (before.childId !== childId || before.scheduledAtEpochMs > atOrBeforeEpochMs) {
        throw new Error('Reminder cursor ownership or boundary mismatch.');
      }
      boundary = ' AND (scheduled_at_epoch_ms < ? OR (scheduled_at_epoch_ms = ? AND id < ?))';
      params.push(before.scheduledAtEpochMs, before.scheduledAtEpochMs, before.id);
    }
    params.push(limit + 1);
    const rows = await this.database.getAllAsync<ReminderRow>(
      `SELECT ${columns} FROM reminders ` +
        `WHERE child_id = ? AND scheduled_at_epoch_ms <= ?${boundary} ` +
        'ORDER BY scheduled_at_epoch_ms DESC, id DESC LIMIT ?;',
      params,
    );
    const mapped = rows.map((row) => mapRow(row, childId));
    const items = mapped.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: mapped.length > limit && last
        ? { childId, scheduledAtEpochMs: last.scheduledAtEpochMs, id: last.id }
        : null,
    };
  }

  async updateIfMatches(
    expectedInput: Reminder,
    replacementInput: Reminder,
  ): Promise<boolean> {
    const expected = createReminder(expectedInput);
    const replacement = createReminder(replacementInput);
    if (
      replacement.id !== expected.id ||
      replacement.childId !== expected.childId ||
      replacement.revision !== expected.revision + 1
    ) {
      throw new Error('Invalid Reminder replacement identity or revision.');
    }
    const result = await this.database.runAsync(
      `UPDATE reminders
       SET title = ?, scheduled_at_epoch_ms = ?, revision = ?
       WHERE child_id = ? AND id = ? AND revision = ?;`,
      [
        replacement.title,
        replacement.scheduledAtEpochMs,
        replacement.revision,
        expected.childId,
        expected.id,
        expected.revision,
      ],
    );
    return result.changes === 1;
  }

  async deleteIfMatches(input: Reminder): Promise<boolean> {
    const expected = createReminder(input);
    const result = await this.database.runAsync(
      'DELETE FROM reminders WHERE child_id = ? AND id = ? AND revision = ?;',
      [expected.childId, expected.id, expected.revision],
    );
    return result.changes === 1;
  }
}
