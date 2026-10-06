import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { createFeedingEvent } from '../domain/feeding-event';
import type { BreastfeedingTimerSession } from '../domain/breastfeeding-timer';
import {
  SqliteBreastfeedingTimerRepository,
  type BreastfeedingTimerDatabase,
} from './sqlite-breastfeeding-timer-repository';

type AdapterOptions = Readonly<{
  failWhenSqlContains?: string;
  failCommitBeforeExecution?: boolean;
  failAfterSuccessfulDelete?: boolean;
  throwAfterCommit?: boolean;
  onSql?(source: string): void;
}>;

function adapter(
  database: DatabaseSync,
  options: AdapterOptions = {},
): BreastfeedingTimerDatabase {
  return {
    async execAsync(source: string) {
      options.onSql?.(source);
      if (source === 'COMMIT;' && options.failCommitBeforeExecution) {
        throw new Error('injected commit failure');
      }
      database.exec(source);
      if (source === 'COMMIT;' && options.throwAfterCommit) {
        throw new Error('uncertain commit response');
      }
    },
    async getFirstAsync<T>(source: string, params: unknown[]): Promise<T | null> {
      options.onSql?.(source);
      return (database.prepare(source).get(...params as []) as T | undefined) ?? null;
    },
    async runAsync(source: string, params: unknown[]) {
      options.onSql?.(source);
      if (source.includes(options.failWhenSqlContains ?? '\u0000')) {
        throw new Error('injected write failure');
      }
      const result = database.prepare(source).run(...params as []) as { changes: number };
      if (
        options.failAfterSuccessfulDelete &&
        source.includes('DELETE FROM breastfeeding_timer_session')
      ) {
        throw new Error('injected failure after delete');
      }
      return { changes: Number(result.changes) };
    },
  } as BreastfeedingTimerDatabase;
}

const running: BreastfeedingTimerSession = {
  sessionId: 'session-1', childId: 'child-1', status: 'running',
  activeSide: 'left', accumulatedLeftMs: 10_000, accumulatedRightMs: 20_000,
  segmentStartedAtEpochMs: 1_000_000,
};

function createBreastEvent(input: Readonly<{
  id: string;
  childId: string;
  occurredAtEpochMs: number;
  leftDurationSeconds: number;
  rightDurationSeconds: number;
}>) {
  const event = createFeedingEvent({ ...input, kind: 'breast' });
  if (event.kind !== 'breast') throw new Error('Expected breast event.');
  return event;
}

describe('SqliteBreastfeedingTimerRepository', () => {
  let database: DatabaseSync;

  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.prepare(`
      INSERT INTO children (id, display_name, date_of_birth)
      VALUES (?, ?, ?);
    `).run('child-1', 'Mio', '2025-01-10');
  });

  afterEach(() => database.close());

  it('round-trips running, paused, and finished canonical sessions', async () => {
    const repository = new SqliteBreastfeedingTimerRepository(adapter(database));
    await repository.create(running);
    await expect(new SqliteBreastfeedingTimerRepository(adapter(database)).get())
      .resolves.toEqual(running);

    const paused: BreastfeedingTimerSession = {
      sessionId: 'session-1', childId: 'child-1', status: 'paused',
      resumeSide: 'right', accumulatedLeftMs: 30_000, accumulatedRightMs: 20_000,
    };
    await repository.replace(paused);
    await expect(new SqliteBreastfeedingTimerRepository(adapter(database)).get())
      .resolves.toEqual(paused);

    const finished: BreastfeedingTimerSession = {
      sessionId: 'session-1', childId: 'child-1', status: 'finished',
      accumulatedLeftMs: 30_000, accumulatedRightMs: 40_000,
      finishedAtEpochMs: 2_000_000,
    };
    await repository.replace(finished);
    await expect(new SqliteBreastfeedingTimerRepository(adapter(database)).get())
      .resolves.toEqual(finished);
  });

  it('atomically inserts the completed event and clears the finished session', async () => {
    const sqlOrder: string[] = [];
    const repository = new SqliteBreastfeedingTimerRepository(adapter(database, {
      onSql: (source) => sqlOrder.push(source),
    }));
    const finished: BreastfeedingTimerSession = {
      sessionId: 'session-1', childId: 'child-1', status: 'finished',
      accumulatedLeftMs: 62_500, accumulatedRightMs: 0,
      finishedAtEpochMs: 2_000_000,
    };
    const event = createBreastEvent({
      id: 'event-1', childId: 'child-1', occurredAtEpochMs: 2_000_000,
      leftDurationSeconds: 62, rightDurationSeconds: 0,
    });
    await repository.create(finished);
    sqlOrder.length = 0;
    await repository.complete('session-1', event);

    expect(sqlOrder).toHaveLength(5);
    expect(sqlOrder[0]).toBe('BEGIN IMMEDIATE;');
    expect(sqlOrder[1]).toContain('SELECT session_id');
    expect(sqlOrder[2]).toContain('INSERT INTO feeding_events');
    expect(sqlOrder[3]).toContain('DELETE FROM breastfeeding_timer_session');
    expect(sqlOrder[4]).toBe('COMMIT;');
    await expect(repository.get()).resolves.toBeNull();
    expect(database.prepare(
      'SELECT id, child_id, occurred_at_epoch_ms FROM feeding_events;',
    ).get()).toEqual({
      id: 'event-1', child_id: 'child-1', occurred_at_epoch_ms: 2_000_000,
    });
  });

  it.each(['INSERT INTO feeding_events', 'DELETE FROM breastfeeding_timer_session'])(
    'rolls back both outcomes when completion fails at %s',
    async (failurePoint) => {
      const setup = new SqliteBreastfeedingTimerRepository(adapter(database));
      const finished: BreastfeedingTimerSession = {
        sessionId: 'session-1', childId: 'child-1', status: 'finished',
        accumulatedLeftMs: 5_000, accumulatedRightMs: 0,
        finishedAtEpochMs: 2_000_000,
      };
      await setup.create(finished);
      const repository = new SqliteBreastfeedingTimerRepository(adapter(database, {
        failWhenSqlContains: failurePoint,
      }));
      const event = createBreastEvent({
        id: 'event-1', childId: 'child-1', occurredAtEpochMs: 2_000_000,
        leftDurationSeconds: 5, rightDurationSeconds: 0,
      });

      await expect(repository.complete('session-1', event)).rejects.toThrow();
      await expect(setup.get()).resolves.toEqual(finished);
      expect(database.prepare('SELECT count(*) AS count FROM feeding_events;').get())
        .toEqual({ count: 0 });
    },
  );

  it('rejects a completed event that does not exactly represent the frozen session', async () => {
    const repository = new SqliteBreastfeedingTimerRepository(adapter(database));
    const finished: BreastfeedingTimerSession = {
      sessionId: 'session-1', childId: 'child-1', status: 'finished',
      accumulatedLeftMs: 5_999, accumulatedRightMs: 0,
      finishedAtEpochMs: 2_000_000,
    };
    await repository.create(finished);
    const mismatched = createBreastEvent({
      id: 'event-1', childId: 'child-1', occurredAtEpochMs: 2_000_001,
      leftDurationSeconds: 6, rightDurationSeconds: 0,
    });

    await expect(repository.complete('session-1', mismatched)).rejects.toThrow();
    await expect(repository.get()).resolves.toEqual(finished);
    expect(database.prepare('SELECT count(*) AS count FROM feeding_events;').get())
      .toEqual({ count: 0 });
  });

  it.each([
    ['after DELETE succeeds but before COMMIT', { failAfterSuccessfulDelete: true }],
    ['when COMMIT fails before execution', { failCommitBeforeExecution: true }],
  ] as const)(
    'rolls back event insertion and session deletion %s',
    async (_description, options) => {
      const setup = new SqliteBreastfeedingTimerRepository(adapter(database));
      const finished: BreastfeedingTimerSession = {
        sessionId: 'session-1', childId: 'child-1', status: 'finished',
        accumulatedLeftMs: 5_000, accumulatedRightMs: 0,
        finishedAtEpochMs: 2_000_000,
      };
      await setup.create(finished);
      const repository = new SqliteBreastfeedingTimerRepository(
        adapter(database, options),
      );
      const event = createBreastEvent({
        id: 'event-1', childId: 'child-1', occurredAtEpochMs: 2_000_000,
        leftDurationSeconds: 5, rightDurationSeconds: 0,
      });

      await expect(repository.complete('session-1', event)).rejects.toThrow();
      await expect(setup.get()).resolves.toEqual(finished);
      expect(database.prepare('SELECT count(*) AS count FROM feeding_events;').get())
        .toEqual({ count: 0 });
    },
  );

  it('supports authoritative recovery after an uncertain commit response', async () => {
    const setup = new SqliteBreastfeedingTimerRepository(adapter(database));
    await setup.create({
      sessionId: 'session-1', childId: 'child-1', status: 'finished',
      accumulatedLeftMs: 5_000, accumulatedRightMs: 0,
      finishedAtEpochMs: 2_000_000,
    });
    const uncertain = new SqliteBreastfeedingTimerRepository(adapter(database, {
      throwAfterCommit: true,
    }));
    const event = createBreastEvent({
      id: 'event-1', childId: 'child-1', occurredAtEpochMs: 2_000_000,
      leftDurationSeconds: 5, rightDurationSeconds: 0,
    });

    await expect(uncertain.complete('session-1', event)).rejects.toThrow();
    await expect(setup.get()).resolves.toBeNull();
    expect(database.prepare('SELECT count(*) AS count FROM feeding_events;').get())
      .toEqual({ count: 1 });
  });

  it.each([
    running,
    {
      sessionId: 'session-1', childId: 'child-1', status: 'paused',
      resumeSide: 'right', accumulatedLeftMs: 10_000, accumulatedRightMs: 20_000,
    },
    {
      sessionId: 'session-1', childId: 'child-1', status: 'finished',
      accumulatedLeftMs: 10_000, accumulatedRightMs: 20_000,
      finishedAtEpochMs: 2_000_000,
    },
  ] satisfies readonly BreastfeedingTimerSession[])(
    'discards persisted $status state without creating a feeding event',
    async (session) => {
      const repository = new SqliteBreastfeedingTimerRepository(adapter(database));
      await repository.create(session);

      await repository.discard(session.sessionId);

      await expect(new SqliteBreastfeedingTimerRepository(adapter(database)).get())
        .resolves.toBeNull();
      expect(database.prepare('SELECT count(*) AS count FROM feeding_events;').get())
        .toEqual({ count: 0 });
    },
  );

  it('targets the exact persisted session when discarding', async () => {
    const repository = new SqliteBreastfeedingTimerRepository(adapter(database));
    await repository.create(running);

    await expect(repository.discard('other-session')).rejects.toThrow();

    await expect(repository.get()).resolves.toEqual(running);
  });

  it('preserves the session on a definite discard write failure', async () => {
    const setup = new SqliteBreastfeedingTimerRepository(adapter(database));
    await setup.create(running);
    const failing = new SqliteBreastfeedingTimerRepository(adapter(database, {
      failWhenSqlContains: 'DELETE FROM breastfeeding_timer_session',
    }));

    await expect(failing.discard(running.sessionId)).rejects.toThrow();

    await expect(setup.get()).resolves.toEqual(running);
  });

  it('supports authoritative recovery when discard succeeds but its response fails', async () => {
    const setup = new SqliteBreastfeedingTimerRepository(adapter(database));
    await setup.create(running);
    const uncertain = new SqliteBreastfeedingTimerRepository(adapter(database, {
      failAfterSuccessfulDelete: true,
    }));

    await expect(uncertain.discard(running.sessionId)).rejects.toThrow();

    await expect(setup.get()).resolves.toBeNull();
    expect(database.prepare('SELECT count(*) AS count FROM feeding_events;').get())
      .toEqual({ count: 0 });
  });
});
