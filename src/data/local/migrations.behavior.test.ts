import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMigratedTestDatabase } from './migrated-test-database.test-helper';

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
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`;

type FeedingRowInput = Readonly<{
  id: string;
  childId: string;
  occurredAtEpochMs: string | number | null;
  kind: string | null;
  leftDurationSeconds: string | number | null;
  rightDurationSeconds: string | number | null;
  amountTenthsMl: string | number | null;
  contents: string | null;
}>;

const validBreastRow: FeedingRowInput = {
  id: 'feeding-1',
  childId: 'child-1',
  occurredAtEpochMs: 1_765_000_000_123,
  kind: 'breast',
  leftDurationSeconds: 60,
  rightDurationSeconds: 0,
  amountTenthsMl: null,
  contents: null,
};

const validBottleRow: FeedingRowInput = {
  ...validBreastRow,
  kind: 'bottle',
  leftDurationSeconds: null,
  rightDurationSeconds: null,
  amountTenthsMl: 625,
  contents: 'formula',
};

describe('feeding_events migrated schema behavior', () => {
  let database: DatabaseSync;

  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.prepare(`
      INSERT INTO children (id, display_name, date_of_birth)
      VALUES (?, ?, ?);
    `).run('child-1', 'Mio', '2025-01-10');
  });

  afterEach(() => database.close());

  function insertFeeding(overrides: Partial<FeedingRowInput> = {}) {
    const row = { ...validBreastRow, ...overrides };
    return database.prepare(INSERT_FEEDING).run(
      row.id,
      row.childId,
      row.occurredAtEpochMs,
      row.kind,
      row.leftDurationSeconds,
      row.rightDurationSeconds,
      row.amountTenthsMl,
      row.contents,
    );
  }

  it.each([
    ['both durations zero', { leftDurationSeconds: 0, rightDurationSeconds: 0 }],
    ['negative left duration', { leftDurationSeconds: -1 }],
    ['negative right duration', { rightDurationSeconds: -1 }],
    ['fractional left duration', { leftDurationSeconds: 1.5 }],
    ['fractional right duration', { rightDurationSeconds: 1.5 }],
    ['NULL left duration', { leftDurationSeconds: null }],
    ['NULL right duration', { rightDurationSeconds: null }],
    ['nonnumeric duration text', { leftDurationSeconds: 'sixty' }],
    ['bottle amount on breast row', { amountTenthsMl: 10 }],
    ['bottle contents on breast row', { contents: 'formula' }],
  ] satisfies readonly [string, Partial<FeedingRowInput>][]) (
    'rejects breast row with %s',
    (_description, overrides) => {
      expect(() => insertFeeding(overrides)).toThrow();
    },
  );

  it.each([
    ['zero amount', { amountTenthsMl: 0 }],
    ['negative amount', { amountTenthsMl: -1 }],
    ['fractional amount', { amountTenthsMl: 1.5 }],
    ['NULL amount', { amountTenthsMl: null }],
    ['nonnumeric amount text', { amountTenthsMl: 'ten' }],
    ['unsupported contents', { contents: 'unknown' }],
    ['NULL contents', { contents: null }],
    ['left breast duration', { leftDurationSeconds: 0 }],
    ['right breast duration', { rightDurationSeconds: 0 }],
  ] satisfies readonly [string, Partial<FeedingRowInput>][]) (
    'rejects bottle row with %s',
    (_description, overrides) => {
      expect(() => insertFeeding({ ...validBottleRow, ...overrides })).toThrow();
    },
  );

  it.each([
    ['unsupported kind', { kind: 'solid' }],
    ['NULL kind', { kind: null }],
    ['fractional occurrence time', { occurredAtEpochMs: 1.5 }],
    ['nonnumeric occurrence time', { occurredAtEpochMs: 'now' }],
    ['NULL occurrence time', { occurredAtEpochMs: null }],
  ] satisfies readonly [string, Partial<FeedingRowInput>][]) (
    'rejects common row with %s',
    (_description, overrides) => {
      expect(() => insertFeeding(overrides)).toThrow();
    },
  );

  it('enforces child ownership and cascades feeding rows on child deletion', () => {
    const foreignKeys = database.prepare('PRAGMA foreign_keys;').get() as {
      foreign_keys: number;
    };
    expect(foreignKeys.foreign_keys).toBe(1);
    expect(() => insertFeeding({ childId: 'missing-child' })).toThrow();

    expect(() => insertFeeding()).not.toThrow();
    expect(database.prepare(
      'SELECT count(*) AS count FROM feeding_events WHERE child_id = ?;',
    ).get('child-1')).toEqual({ count: 1 });

    database.prepare('DELETE FROM children WHERE id = ?;').run('child-1');
    expect(database.prepare(
      'SELECT count(*) AS count FROM feeding_events WHERE child_id = ?;',
    ).get('child-1')).toEqual({ count: 0 });
  });
});
