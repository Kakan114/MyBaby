import type { BreastfeedingTimerRepository } from '../application/breastfeeding-timer-repository';
import {
  validateBreastfeedingTimerSession,
  timerDurationSeconds,
  type BreastfeedingTimerSession,
} from '../domain/breastfeeding-timer';
import type { BreastFeedingEvent } from '../domain/feeding-event';
import {
  insertFeedingEvent,
  type FeedingWriteDatabase,
} from './sqlite-feeding-repository';

type BindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;
type RunResult = Readonly<{ changes: number }>;

export interface BreastfeedingTimerDatabase extends FeedingWriteDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, params: BindValue[]): Promise<T | null>;
  runAsync(source: string, params: BindValue[]): Promise<RunResult>;
}

type TimerRow = {
  session_id: string;
  child_id: string;
  state: 'running' | 'paused' | 'finished';
  accumulated_left_ms: number;
  accumulated_right_ms: number;
  active_side: 'left' | 'right' | null;
  resume_side: 'left' | 'right' | null;
  segment_started_at_epoch_ms: number | null;
  finished_at_epoch_ms: number | null;
};

const SELECT_TIMER = `
  SELECT session_id, child_id, state, accumulated_left_ms,
         accumulated_right_ms, active_side, resume_side,
         segment_started_at_epoch_ms, finished_at_epoch_ms
  FROM breastfeeding_timer_session
  WHERE id = 1;
`;

const INSERT_TIMER = `
  INSERT INTO breastfeeding_timer_session (
    id, session_id, child_id, state, accumulated_left_ms,
    accumulated_right_ms, active_side, resume_side,
    segment_started_at_epoch_ms, finished_at_epoch_ms
  ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const UPDATE_TIMER = `
  UPDATE breastfeeding_timer_session
  SET child_id = ?, state = ?, accumulated_left_ms = ?,
      accumulated_right_ms = ?, active_side = ?, resume_side = ?,
      segment_started_at_epoch_ms = ?, finished_at_epoch_ms = ?
  WHERE id = 1 AND session_id = ?;
`;

const DELETE_TIMER = `
  DELETE FROM breastfeeding_timer_session
  WHERE id = 1 AND session_id = ?;
`;

function mapRow(row: TimerRow): BreastfeedingTimerSession {
  const common = {
    sessionId: row.session_id,
    childId: row.child_id,
    accumulatedLeftMs: row.accumulated_left_ms,
    accumulatedRightMs: row.accumulated_right_ms,
  } as const;

  if (row.state === 'running') {
    if (row.active_side === null || row.segment_started_at_epoch_ms === null) {
      throw new Error('Invalid running timer row.');
    }
    return validateBreastfeedingTimerSession({
      ...common,
      status: 'running',
      activeSide: row.active_side,
      segmentStartedAtEpochMs: row.segment_started_at_epoch_ms,
    });
  }
  if (row.state === 'paused') {
    if (row.resume_side === null) throw new Error('Invalid paused timer row.');
    return validateBreastfeedingTimerSession({
      ...common,
      status: 'paused',
      resumeSide: row.resume_side,
    });
  }
  if (row.state !== 'finished' || row.finished_at_epoch_ms === null) {
    throw new Error('Invalid finished timer row.');
  }
  return validateBreastfeedingTimerSession({
    ...common,
    status: 'finished',
    finishedAtEpochMs: row.finished_at_epoch_ms,
  });
}

function values(session: BreastfeedingTimerSession): BindValue[] {
  return [
    session.sessionId,
    session.childId,
    session.status,
    session.accumulatedLeftMs,
    session.accumulatedRightMs,
    session.status === 'running' ? session.activeSide : null,
    session.status === 'paused' ? session.resumeSide : null,
    session.status === 'running' ? session.segmentStartedAtEpochMs : null,
    session.status === 'finished' ? session.finishedAtEpochMs : null,
  ];
}

export class SqliteBreastfeedingTimerRepository
implements BreastfeedingTimerRepository {
  constructor(private readonly database: BreastfeedingTimerDatabase) {}

  async get(): Promise<BreastfeedingTimerSession | null> {
    const row = await this.database.getFirstAsync<TimerRow>(SELECT_TIMER, []);
    return row === null ? null : mapRow(row);
  }

  async create(session: BreastfeedingTimerSession): Promise<void> {
    validateBreastfeedingTimerSession(session);
    await this.database.runAsync(INSERT_TIMER, values(session));
  }

  async replace(session: BreastfeedingTimerSession): Promise<void> {
    validateBreastfeedingTimerSession(session);
    const [sessionId, childId, state, left, right, active, resume, started, finished] =
      values(session);
    const result = await this.database.runAsync(UPDATE_TIMER, [
      childId, state, left, right, active, resume, started, finished, sessionId,
    ]);
    if (result.changes !== 1) throw new Error('Timer session no longer exists.');
  }

  async discard(sessionId: string): Promise<void> {
    const result = await this.database.runAsync(DELETE_TIMER, [sessionId]);
    if (result.changes !== 1) throw new Error('Timer session was not discarded.');
  }

  async complete(sessionId: string, event: BreastFeedingEvent): Promise<void> {
    let transactionStarted = false;
    try {
      await this.database.execAsync('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const row = await this.database.getFirstAsync<TimerRow>(SELECT_TIMER, []);
      if (row === null) throw new Error('Timer session no longer exists.');
      const session = mapRow(row);
      if (
        session.sessionId !== sessionId ||
        session.status !== 'finished' ||
        session.childId !== event.childId
      ) {
        throw new Error('Timer session cannot be completed.');
      }
      const durations = timerDurationSeconds(session);
      if (
        event.occurredAtEpochMs !== session.finishedAtEpochMs ||
        event.leftDurationSeconds !== durations.leftDurationSeconds ||
        event.rightDurationSeconds !== durations.rightDurationSeconds
      ) {
        throw new Error('Completed feeding does not match the timer session.');
      }

      await insertFeedingEvent(this.database, event);
      const result = await this.database.runAsync(`
        DELETE FROM breastfeeding_timer_session
        WHERE id = 1 AND session_id = ? AND state = 'finished';
      `, [sessionId]);
      if (result.changes !== 1) throw new Error('Timer session was not cleared.');
      await this.database.execAsync('COMMIT;');
    } catch (error) {
      if (transactionStarted) {
        try {
          await this.database.execAsync('ROLLBACK;');
        } catch {
          // Preserve the original failure; COMMIT may already have succeeded.
        }
      }
      throw error;
    }
  }
}
