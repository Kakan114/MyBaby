import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';

import { createFeedingEvent, type FeedingEvent } from '../domain/feeding-event';
import { SqliteFeedingRepository } from './sqlite-feeding-repository';

type PersistedFeedingRow = {
  id: string;
  child_id: string;
  occurred_at_epoch_ms: number;
  kind: string;
  left_duration_seconds: number | null;
  right_duration_seconds: number | null;
  amount_tenths_ml: number | null;
  contents: string | null;
};

function createRepository(database: DatabaseSync) {
  return new SqliteFeedingRepository({
    async runAsync(source, params) {
      const sqliteValues = params.map((value) => {
        if (typeof value === 'boolean') return Number(value);
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        return value;
      });
      return database.prepare(source).run(...sqliteValues);
    },
  });
}

describe('SqliteFeedingRepository', () => {
  let database: DatabaseSync;

  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.prepare(`
      INSERT INTO children (id, display_name, date_of_birth)
      VALUES (?, ?, ?);
    `).run('child-1', 'Mio', '2025-01-10');
  });

  afterEach(() => database.close());

  it.each([
    [
      {
        id: 'breast-1', childId: 'child-1', occurredAtEpochMs: 123,
        kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 120,
      } satisfies FeedingEvent,
      ['breast-1', 'child-1', 123, 'breast', 60, 120, null, null],
    ],
    [
      {
        id: 'bottle-1', childId: 'child-1', occurredAtEpochMs: 456,
        kind: 'bottle', amountMl: 72.5, contents: 'mixed',
      } satisfies FeedingEvent,
      ['bottle-1', 'child-1', 456, 'bottle', null, null, 725, 'mixed'],
    ],
  ])('maps and binds every value for $kind', async (event, expectedParams) => {
    const runAsync = vi.fn(async (
      _source: string,
      _params: (string | number | null | boolean | Uint8Array | ArrayBuffer)[],
    ): Promise<unknown> => undefined);
    await new SqliteFeedingRepository({ runAsync }).save(event);

    expect(runAsync).toHaveBeenCalledOnce();
    const [sql, params] = runAsync.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO feeding_events');
    expect(sql).toContain('VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    expect(sql).not.toContain('ON CONFLICT');
    expect(sql).not.toContain('REPLACE');
    expect(sql).not.toContain(event.id);
    expect(params).toEqual(expectedParams);
  });

  it.each([
    [1, 10, 'expressed-breast-milk'],
    [62.5, 625, 'mixed'],
  ] as const)(
    'persists %s ml as exactly %s integer tenths',
    async (amountMl, amountTenthsMl, contents) => {
      const event = createFeedingEvent({
        id: `bottle-${amountTenthsMl}`,
        childId: 'child-1',
        occurredAtEpochMs: 1_765_000_000_123,
        kind: 'bottle',
        amountMl,
        contents,
      });

      await createRepository(database).save(event);

      expect(database.prepare(`
        SELECT id, child_id, occurred_at_epoch_ms, kind,
               left_duration_seconds, right_duration_seconds,
               amount_tenths_ml, contents
        FROM feeding_events
        WHERE id = ?;
      `).get(event.id)).toEqual({
        id: event.id,
        child_id: 'child-1',
        occurred_at_epoch_ms: 1_765_000_000_123,
        kind: 'bottle',
        left_duration_seconds: null,
        right_duration_seconds: null,
        amount_tenths_ml: amountTenthsMl,
        contents,
      } satisfies PersistedFeedingRow);
    },
  );

  it('persists breast seconds and NULL bottle columns exactly', async () => {
    const event = createFeedingEvent({
      id: 'breast-persisted',
      childId: 'child-1',
      occurredAtEpochMs: 1_765_000_000_456,
      kind: 'breast',
      leftDurationSeconds: 90,
      rightDurationSeconds: 120,
    });

    await createRepository(database).save(event);

    expect(database.prepare(`
      SELECT id, child_id, occurred_at_epoch_ms, kind,
             left_duration_seconds, right_duration_seconds,
             amount_tenths_ml, contents
      FROM feeding_events
      WHERE id = ?;
    `).get(event.id)).toEqual({
      id: 'breast-persisted',
      child_id: 'child-1',
      occurred_at_epoch_ms: 1_765_000_000_456,
      kind: 'breast',
      left_duration_seconds: 90,
      right_duration_seconds: 120,
      amount_tenths_ml: null,
      contents: null,
    } satisfies PersistedFeedingRow);
  });

  it('rejects a failed write and does not report or mutate it as success', async () => {
    const repository = createRepository(database);
    const original = createFeedingEvent({
      id: 'duplicate-id',
      childId: 'child-1',
      occurredAtEpochMs: 100,
      kind: 'bottle',
      amountMl: 1,
      contents: 'formula',
    });
    const conflicting = createFeedingEvent({
      id: 'duplicate-id',
      childId: 'child-1',
      occurredAtEpochMs: 200,
      kind: 'breast',
      leftDurationSeconds: 60,
      rightDurationSeconds: 0,
    });

    await expect(repository.save(original)).resolves.toBeUndefined();
    await expect(repository.save(conflicting)).rejects.toThrow();
    expect(database.prepare(`
      SELECT occurred_at_epoch_ms, kind, amount_tenths_ml
      FROM feeding_events WHERE id = ?;
    `).get('duplicate-id')).toEqual({
      occurred_at_epoch_ms: 100,
      kind: 'bottle',
      amount_tenths_ml: 10,
    });
  });
});
