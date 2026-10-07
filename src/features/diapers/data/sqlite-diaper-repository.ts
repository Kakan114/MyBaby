import { assertEpochRange, type EpochRange } from '../../../utils/epoch-range';
import { readEventStatistics, type EventStatisticsRow } from '../../../data/local/event-statistics';
import type { DiaperSummaryReader } from '../application/diaper-summary-reader';
import type { DiaperRepository } from '../application/diaper-repository';
import { createDiaperEvent, type DiaperEvent } from '../domain/diaper-event';

type BindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

export interface DiaperDatabase {
  getAllAsync<T>(source: string, params: BindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: BindValue[]): Promise<T | null>;
  runAsync(source: string, params: BindValue[]): Promise<Readonly<{ changes: number }>>;
}

type DiaperRow = {
  id: unknown;
  child_id: unknown;
  occurred_at_epoch_ms: unknown;
  kind: unknown;
};

const SELECT_BY_ID = `
  SELECT id, child_id, occurred_at_epoch_ms, kind
  FROM diaper_events
  WHERE child_id = ? AND id = ?;
`;

const SELECT_RECENT = `
  SELECT id, child_id, occurred_at_epoch_ms, kind
  FROM diaper_events
  WHERE child_id = ?
  ORDER BY occurred_at_epoch_ms DESC, id DESC
  LIMIT ?;
`;

function mapRow(row: DiaperRow, expectedChildId: string): DiaperEvent {
  if (
    typeof row.id !== 'string' ||
    typeof row.child_id !== 'string' ||
    row.child_id !== expectedChildId ||
    typeof row.occurred_at_epoch_ms !== 'number' ||
    typeof row.kind !== 'string'
  ) throw new Error('Invalid persisted diaper row.');
  return createDiaperEvent({
    id: row.id,
    childId: row.child_id,
    occurredAtEpochMs: row.occurred_at_epoch_ms,
    kind: row.kind as DiaperEvent['kind'],
  });
}

export class SqliteDiaperRepository implements DiaperRepository, DiaperSummaryReader {
  async getEventSummary(childId: string, day: EpochRange) {
    assertEpochRange(day);
    if (childId.trim().length === 0) throw new Error('Invalid child ID.');
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM diaper_events
          WHERE child_id = ? AND occurred_at_epoch_ms >= ? AND occurred_at_epoch_ms < ?) AS day_count,
        (SELECT MAX(occurred_at_epoch_ms) FROM diaper_events WHERE child_id = ?) AS latest_epoch_ms;
    `;
    const row = await this.database.getFirstAsync<EventStatisticsRow>(sql, [childId, day.startEpochMs, day.endEpochMs, childId]);
    const result = readEventStatistics(row ?? undefined);
    return { dayCount: result.dayCount, latestOccurredAtEpochMs: result.latestEpochMs };
  }

  constructor(private readonly database: DiaperDatabase) {}

  async save(event: DiaperEvent): Promise<void> {
    const value = createDiaperEvent(event);
    await this.database.runAsync(`
      INSERT INTO diaper_events (id, child_id, occurred_at_epoch_ms, kind)
      VALUES (?, ?, ?, ?);
    `, [value.id, value.childId, value.occurredAtEpochMs, value.kind]);
  }

  async getById(childId: string, id: string): Promise<DiaperEvent | null> {
    if (childId.trim().length === 0 || id.trim().length === 0) {
      throw new Error('Invalid diaper lookup.');
    }
    const row = await this.database.getFirstAsync<DiaperRow>(SELECT_BY_ID, [childId, id]);
    return row === null ? null : mapRow(row, childId);
  }

  async listRecentByChildId(childId: string, limit: number): Promise<readonly DiaperEvent[]> {
    if (childId.trim().length === 0 || !Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Invalid diaper history query.');
    }
    const rows = await this.database.getAllAsync<DiaperRow>(SELECT_RECENT, [childId, limit]);
    return rows.map((row) => mapRow(row, childId));
  }

  async deleteIfMatches(expected: DiaperEvent): Promise<boolean> {
    const value = createDiaperEvent(expected);
    const result = await this.database.runAsync(`
      DELETE FROM diaper_events
      WHERE id = ? AND child_id = ? AND occurred_at_epoch_ms = ? AND kind = ?;
    `, [value.id, value.childId, value.occurredAtEpochMs, value.kind]);
    return result.changes === 1;
  }

  async updateIfMatches(expected: DiaperEvent, replacement: DiaperEvent): Promise<boolean> {
    const current = createDiaperEvent(expected);
    const next = createDiaperEvent(replacement);
    if (next.id !== current.id || next.childId !== current.childId) {
      throw new Error('A diaper update cannot change event ownership.');
    }
    const result = await this.database.runAsync(`
      UPDATE diaper_events
      SET occurred_at_epoch_ms = ?, kind = ?
      WHERE id = ? AND child_id = ? AND occurred_at_epoch_ms = ? AND kind = ?;
    `, [
      next.occurredAtEpochMs, next.kind,
      current.id, current.childId, current.occurredAtEpochMs, current.kind,
    ]);
    return result.changes === 1;
  }
}
