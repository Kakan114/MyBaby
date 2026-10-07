import { assertEpochRange, type EpochRange } from '../../../utils/epoch-range';
import { readEventStatistics, type EventStatisticsRow } from '../../../data/local/event-statistics';
import type { FeedingSummaryReader } from '../application/feeding-summary-reader';
import type { FeedingRepository } from '../application/feeding-repository';
import {
  amountMlToTenths,
  createFeedingEvent,
  type BottleContents,
  type FeedingEvent,
} from '../domain/feeding-event';

type FeedingRepositoryBindValue =
  | string
  | number
  | null
  | boolean
  | Uint8Array
  | ArrayBuffer;

export interface FeedingWriteDatabase {
  runAsync(source: string, params: FeedingRepositoryBindValue[]): Promise<unknown>;
}

export interface FeedingRepositoryDatabase extends FeedingWriteDatabase {
  getAllAsync(
    source: string,
    params: FeedingRepositoryBindValue[],
  ): Promise<unknown[]>;
}

type FeedingRow = {
  id: unknown;
  child_id: unknown;
  occurred_at_epoch_ms: unknown;
  kind: unknown;
  left_duration_seconds: unknown;
  right_duration_seconds: unknown;
  amount_tenths_ml: unknown;
  contents: unknown;
};

const INSERT_FEEDING = `
  INSERT INTO feeding_events (
    id,
    child_id,
    occurred_at_epoch_ms,
    kind,
    left_duration_seconds,
    right_duration_seconds,
    amount_tenths_ml,
    contents
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`;

const SELECT_RECENT_FEEDINGS = `
  SELECT id, child_id, occurred_at_epoch_ms, kind,
         left_duration_seconds, right_duration_seconds,
         amount_tenths_ml, contents
  FROM feeding_events
  WHERE child_id = ?
  ORDER BY occurred_at_epoch_ms DESC, id DESC
  LIMIT ?;
`;

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isBottleContents(value: unknown): value is BottleContents {
  return value === 'expressed-breast-milk' || value === 'formula' || value === 'mixed';
}

function mapFeedingRow(row: FeedingRow, requestedChildId: string): FeedingEvent {
  if (
    typeof row.id !== 'string' ||
    typeof row.child_id !== 'string' ||
    row.child_id !== requestedChildId ||
    !isSafeInteger(row.occurred_at_epoch_ms) ||
    row.occurred_at_epoch_ms < 0 ||
    !Number.isFinite(new Date(row.occurred_at_epoch_ms).getTime())
  ) {
    throw new Error('Invalid persisted feeding row.');
  }

  const common = {
    id: row.id,
    childId: row.child_id,
    occurredAtEpochMs: row.occurred_at_epoch_ms,
  } as const;

  if (row.kind === 'breast') {
    if (
      !isSafeInteger(row.left_duration_seconds) ||
      !isSafeInteger(row.right_duration_seconds) ||
      row.amount_tenths_ml !== null ||
      row.contents !== null
    ) {
      throw new Error('Invalid persisted breast feeding row.');
    }

    return createFeedingEvent({
      ...common,
      kind: 'breast',
      leftDurationSeconds: row.left_duration_seconds,
      rightDurationSeconds: row.right_duration_seconds,
    });
  }

  if (row.kind === 'bottle') {
    if (
      row.left_duration_seconds !== null ||
      row.right_duration_seconds !== null ||
      !isSafeInteger(row.amount_tenths_ml) ||
      row.amount_tenths_ml <= 0 ||
      !isBottleContents(row.contents)
    ) {
      throw new Error('Invalid persisted bottle feeding row.');
    }

    const amountMl = row.amount_tenths_ml / 10;
    if (amountMlToTenths(amountMl) !== row.amount_tenths_ml) {
      throw new Error('Invalid persisted bottle amount.');
    }

    return createFeedingEvent({
      ...common,
      kind: 'bottle',
      amountMl,
      contents: row.contents,
    });
  }

  throw new Error('Invalid persisted feeding kind.');
}

export class SqliteFeedingRepository implements FeedingRepository, FeedingSummaryReader {
  async getCompletedSummary(childId: string, day: EpochRange) {
    assertEpochRange(day);
    if (childId.trim().length === 0) throw new Error('Invalid child ID.');
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM feeding_events
          WHERE child_id = ? AND occurred_at_epoch_ms >= ? AND occurred_at_epoch_ms < ?) AS day_count,
        (SELECT MAX(occurred_at_epoch_ms) FROM feeding_events WHERE child_id = ?) AS latest_epoch_ms;
    `;
    const rows = await this.database.getAllAsync(sql, [childId, day.startEpochMs, day.endEpochMs, childId]);
    const result = readEventStatistics(rows[0] as EventStatisticsRow | undefined);
    return { dayCount: result.dayCount, latestCompletedAtEpochMs: result.latestEpochMs };
  }

  constructor(private readonly database: FeedingRepositoryDatabase) {}

  async listRecentByChildId(
    childId: string,
    limit: number,
  ): Promise<readonly FeedingEvent[]> {
    if (childId.trim().length === 0 || !Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Invalid feeding history query.');
    }

    const rows = await this.database.getAllAsync(
      SELECT_RECENT_FEEDINGS,
      [childId, limit],
    );
    return rows.map((row) => mapFeedingRow(row as FeedingRow, childId));
  }

  async save(event: FeedingEvent): Promise<void> {
    await insertFeedingEvent(this.database, event);
  }
}

export async function insertFeedingEvent(
  database: FeedingWriteDatabase,
  event: FeedingEvent,
): Promise<void> {
    const variantValues = event.kind === 'breast'
      ? [event.leftDurationSeconds, event.rightDurationSeconds, null, null]
      : [null, null, amountMlToTenths(event.amountMl), event.contents];

    await database.runAsync(INSERT_FEEDING, [
      event.id,
      event.childId,
      event.occurredAtEpochMs,
      event.kind,
      ...variantValues,
    ]);
}
