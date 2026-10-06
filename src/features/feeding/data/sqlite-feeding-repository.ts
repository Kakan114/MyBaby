import type { FeedingRepository } from '../application/feeding-repository';
import { amountMlToTenths, type FeedingEvent } from '../domain/feeding-event';

type FeedingRepositoryBindValue =
  | string
  | number
  | null
  | boolean
  | Uint8Array
  | ArrayBuffer;

export interface FeedingRepositoryDatabase {
  runAsync(source: string, params: FeedingRepositoryBindValue[]): Promise<unknown>;
}

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

export class SqliteFeedingRepository implements FeedingRepository {
  constructor(private readonly database: FeedingRepositoryDatabase) {}

  async save(event: FeedingEvent): Promise<void> {
    const variantValues = event.kind === 'breast'
      ? [event.leftDurationSeconds, event.rightDurationSeconds, null, null]
      : [null, null, amountMlToTenths(event.amountMl), event.contents];

    await this.database.runAsync(INSERT_FEEDING, [
      event.id,
      event.childId,
      event.occurredAtEpochMs,
      event.kind,
      ...variantValues,
    ]);
  }
}
