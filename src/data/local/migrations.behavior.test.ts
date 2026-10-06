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

describe('breastfeeding_timer_session migrated schema behavior', () => {
  let database: DatabaseSync;

  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.prepare(`
      INSERT INTO children (id, display_name, date_of_birth)
      VALUES (?, ?, ?);
    `).run('child-1', 'Mio', '2025-01-10');
  });

  afterEach(() => database.close());

  const INSERT_TIMER = `
    INSERT INTO breastfeeding_timer_session (
      id, session_id, child_id, state, accumulated_left_ms,
      accumulated_right_ms, active_side, resume_side,
      segment_started_at_epoch_ms, finished_at_epoch_ms
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  type TimerInput = {
    sessionId: string;
    childId: string;
    state: string;
    left: string | number | null;
    right: string | number | null;
    active: string | null;
    resume: string | null;
    started: string | number | null;
    finished: string | number | null;
  };

  const running: TimerInput = {
    sessionId: 'session-1', childId: 'child-1', state: 'running',
    left: 0, right: 0, active: 'left', resume: null,
    started: 1_000_000, finished: null,
  };

  function insert(overrides: Partial<TimerInput> = {}) {
    const row = { ...running, ...overrides };
    return database.prepare(INSERT_TIMER).run(
      row.sessionId, row.childId, row.state, row.left, row.right,
      row.active, row.resume, row.started, row.finished,
    );
  }

  it.each([
    ['unknown state', { state: 'unknown' }],
    ['negative left', { left: -1 }],
    ['fractional right', { right: 1.5 }],
    ['unsafe left duration', { left: Number.MAX_SAFE_INTEGER + 1 }],
    ['text duration', { left: 'many' }],
    ['NULL duration', { right: null }],
    ['running without active side', { active: null }],
    ['running with invalid side', { active: 'middle' }],
    ['running with resume side', { resume: 'right' }],
    ['running without anchor', { started: null }],
    ['running with fractional anchor', { started: 1.5 }],
    ['running with unsafe anchor', { started: Number.MAX_SAFE_INTEGER + 1 }],
    ['running with finish epoch', { finished: 2_000_000 }],
    ['paused with active side', {
      state: 'paused', active: 'left', resume: 'left', started: null,
    }],
    ['paused without resume side', {
      state: 'paused', active: null, resume: null, started: null,
    }],
    ['paused with anchor', {
      state: 'paused', active: null, resume: 'left', started: 1_000_000,
    }],
    ['finished with side', {
      state: 'finished', active: null, resume: 'left', started: null,
      finished: 2_000_000,
    }],
    ['finished without epoch', {
      state: 'finished', active: null, resume: null, started: null,
      finished: null,
    }],
    ['finished with fractional epoch', {
      state: 'finished', active: null, resume: null, started: null,
      finished: 2.5,
    }],
    ['finished with unsafe epoch', {
      state: 'finished', active: null, resume: null, started: null,
      finished: Number.MAX_SAFE_INTEGER + 1,
    }],
  ] satisfies readonly [string, Partial<TimerInput>][]) (
    'rejects %s',
    (_description, overrides) => expect(() => insert(overrides)).toThrow(),
  );

  it('accepts exactly running, paused, and finished valid combinations', () => {
    expect(() => insert()).not.toThrow();
    database.exec('DELETE FROM breastfeeding_timer_session;');
    expect(() => insert({
      state: 'paused', active: null, resume: 'right', started: null,
    })).not.toThrow();
    database.exec('DELETE FROM breastfeeding_timer_session;');
    expect(() => insert({
      state: 'finished', active: null, resume: null, started: null,
      finished: 2_000_000,
    })).not.toThrow();
  });

  it('enforces one app-wide session, child ownership, and child-delete cascade', () => {
    expect(() => insert({ childId: 'missing-child' })).toThrow();
    insert();
    expect(() => insert({ sessionId: 'session-2' })).toThrow();
    database.prepare('DELETE FROM children WHERE id = ?;').run('child-1');
    expect(database.prepare(
      'SELECT count(*) AS count FROM breastfeeding_timer_session;',
    ).get()).toEqual({ count: 0 });
  });
});
