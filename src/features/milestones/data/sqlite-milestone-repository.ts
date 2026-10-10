import {
  createCalendarDate,
  type CalendarDate,
} from '../../children/domain/calendar-date';
import type {
  MilestoneHistoryCursor,
  MilestoneHistoryPage,
  MilestoneRepository,
} from '../application/milestone-repository';
import type { MilestoneDefinitionId } from '../domain/milestone-catalog';
import {
  createMilestoneEntry,
  type MilestoneEntry,
  type MilestoneSubject,
} from '../domain/milestone-entry';

type BindValue = string | number | null;

export interface MilestoneDatabase {
  getFirstAsync<T>(sql: string, params: BindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: BindValue[]): Promise<T[]>;
  runAsync(sql: string, params: BindValue[]): Promise<Readonly<{ changes: number }>>;
}

type MilestoneRow = Readonly<{
  id: unknown;
  child_id: unknown;
  definition_id: unknown;
  custom_title: unknown;
  note: unknown;
  occurred_on: unknown;
  revision: unknown;
}>;

const columns = 'id, child_id, definition_id, custom_title, note, occurred_on, revision';

function assertIdentity(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid Milestone identity.');
  }
}

function mapSubject(row: MilestoneRow): MilestoneSubject {
  if (typeof row.definition_id === 'string' && row.custom_title === null) {
    return {
      kind: 'predefined',
      definitionId: row.definition_id as MilestoneDefinitionId,
    };
  }
  if (row.definition_id === null && typeof row.custom_title === 'string') {
    return { kind: 'custom', title: row.custom_title };
  }
  throw new Error('Invalid persisted Milestone subject.');
}

function mapRow(row: MilestoneRow, childId: string): MilestoneEntry {
  if (
    typeof row.id !== 'string' ||
    typeof row.child_id !== 'string' ||
    row.child_id !== childId ||
    !(row.note === null || typeof row.note === 'string') ||
    typeof row.occurred_on !== 'string' ||
    typeof row.revision !== 'number'
  ) {
    throw new Error('Invalid persisted Milestone row.');
  }
  const subject = mapSubject(row);
  const entry = createMilestoneEntry({
    id: row.id,
    childId: row.child_id,
    subject,
    occurredOn: row.occurred_on as CalendarDate,
    note: row.note,
    revision: row.revision,
  });
  if (
    entry.note !== row.note ||
    (subject.kind === 'custom' && (
      entry.subject.kind !== 'custom' || entry.subject.title !== row.custom_title
    ))
  ) {
    throw new Error('Persisted Milestone text is not canonical.');
  }
  return entry;
}

function persistedSubject(subject: MilestoneSubject): readonly [string | null, string | null] {
  return subject.kind === 'predefined'
    ? [subject.definitionId, null]
    : [null, subject.title];
}

function values(entry: MilestoneEntry): BindValue[] {
  const [definitionId, customTitle] = persistedSubject(entry.subject);
  return [
    entry.id,
    entry.childId,
    definitionId,
    customTitle,
    entry.note,
    entry.occurredOn,
    entry.revision,
  ];
}

/** Uses the caller's connection; serialization and reconciliation belong to runtime/application. */
export class SqliteMilestoneRepository implements MilestoneRepository {
  constructor(private readonly database: MilestoneDatabase) {}

  async create(input: MilestoneEntry): Promise<void> {
    const entry = createMilestoneEntry(input);
    if (entry.revision !== 1) {
      throw new Error('New Milestone entries require revision 1.');
    }
    await this.database.runAsync(
      `INSERT INTO milestone_entries (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      values(entry),
    );
  }

  async getById(childId: string, id: string): Promise<MilestoneEntry | null> {
    assertIdentity(childId);
    assertIdentity(id);
    const row = await this.database.getFirstAsync<MilestoneRow>(
      `SELECT ${columns} FROM milestone_entries WHERE child_id = ? AND id = ?;`,
      [childId, id],
    );
    return row === null ? null : mapRow(row, childId);
  }

  async listHistory(
    childId: string,
    limit: number,
    before: MilestoneHistoryCursor | null = null,
  ): Promise<MilestoneHistoryPage> {
    assertIdentity(childId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid Milestone page size.');
    }
    const params: BindValue[] = [childId];
    let boundary = '';
    if (before !== null) {
      assertIdentity(before.id);
      if (before.childId !== childId) {
        throw new Error('Milestone cursor ownership mismatch.');
      }
      const occurredOn = createCalendarDate(before.occurredOn);
      boundary = ' AND (occurred_on < ? OR (occurred_on = ? AND id < ?))';
      params.push(occurredOn, occurredOn, before.id);
    }
    params.push(limit + 1);
    const rows = await this.database.getAllAsync<MilestoneRow>(
      `SELECT ${columns} FROM milestone_entries WHERE child_id = ?${boundary} ` +
        'ORDER BY occurred_on DESC, id DESC LIMIT ?;',
      params,
    );
    const mapped = rows.map((row) => mapRow(row, childId));
    const items = mapped.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: mapped.length > limit && last
        ? { childId, occurredOn: last.occurredOn, id: last.id }
        : null,
    };
  }

  async updateIfMatches(
    expectedInput: MilestoneEntry,
    replacementInput: MilestoneEntry,
  ): Promise<boolean> {
    const expected = createMilestoneEntry(expectedInput);
    const replacement = createMilestoneEntry(replacementInput);
    if (
      replacement.id !== expected.id ||
      replacement.childId !== expected.childId ||
      replacement.revision !== expected.revision + 1
    ) {
      throw new Error('Invalid Milestone replacement identity or revision.');
    }
    const [definitionId, customTitle] = persistedSubject(replacement.subject);
    const result = await this.database.runAsync(
      `UPDATE milestone_entries
       SET definition_id = ?, custom_title = ?, note = ?, occurred_on = ?, revision = ?
       WHERE child_id = ? AND id = ? AND revision = ?;`,
      [
        definitionId,
        customTitle,
        replacement.note,
        replacement.occurredOn,
        replacement.revision,
        expected.childId,
        expected.id,
        expected.revision,
      ],
    );
    return result.changes === 1;
  }

  async deleteIfMatches(input: MilestoneEntry): Promise<boolean> {
    const expected = createMilestoneEntry(input);
    const result = await this.database.runAsync(
      'DELETE FROM milestone_entries WHERE child_id = ? AND id = ? AND revision = ?;',
      [expected.childId, expected.id, expected.revision],
    );
    return result.changes === 1;
  }
}
