import type { SleepRepository } from '../application/sleep-repository';
import {
  createActiveSleepSession,
  createSleepEvent,
  type ActiveSleepSession,
  type SleepEvent,
} from '../domain/sleep';

type BindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;
type RunResult = Readonly<{ changes: number }>;

export interface SleepDatabase {
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string, params: BindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: BindValue[]): Promise<T | null>;
  runAsync(source: string, params: BindValue[]): Promise<RunResult>;
}

type ActiveRow = {
  id: unknown;
  child_id: unknown;
  started_at_epoch_ms: unknown;
};

type EventRow = ActiveRow & { ended_at_epoch_ms: unknown };

const SELECT_ACTIVE = `
  SELECT id, child_id, started_at_epoch_ms
  FROM active_sleep_sessions
  WHERE child_id = ?;
`;

const SELECT_EVENT = `
  SELECT id, child_id, started_at_epoch_ms, ended_at_epoch_ms
  FROM sleep_events
  WHERE child_id = ? AND id = ?;
`;

const SELECT_RECENT = `
  SELECT id, child_id, started_at_epoch_ms, ended_at_epoch_ms
  FROM sleep_events
  WHERE child_id = ?
  ORDER BY ended_at_epoch_ms DESC, id DESC
  LIMIT ?;
`;

function mapActive(row: ActiveRow, expectedChildId: string): ActiveSleepSession {
  if (
    typeof row.id !== 'string' ||
    typeof row.child_id !== 'string' ||
    row.child_id !== expectedChildId ||
    typeof row.started_at_epoch_ms !== 'number'
  ) {
    throw new Error('Invalid persisted active sleep row.');
  }
  return createActiveSleepSession({
    id: row.id,
    childId: row.child_id,
    startedAtEpochMs: row.started_at_epoch_ms,
  });
}

function mapEvent(row: EventRow, expectedChildId: string): SleepEvent {
  const active = mapActive(row, expectedChildId);
  if (typeof row.ended_at_epoch_ms !== 'number') {
    throw new Error('Invalid persisted sleep event row.');
  }
  return createSleepEvent({ ...active, endedAtEpochMs: row.ended_at_epoch_ms });
}

export class SqliteSleepRepository implements SleepRepository {
  constructor(private readonly database: SleepDatabase) {}

  async getActiveByChildId(childId: string): Promise<ActiveSleepSession | null> {
    const row = await this.database.getFirstAsync<ActiveRow>(SELECT_ACTIVE, [childId]);
    return row === null ? null : mapActive(row, childId);
  }

  async getEventById(childId: string, id: string): Promise<SleepEvent | null> {
    const row = await this.database.getFirstAsync<EventRow>(SELECT_EVENT, [childId, id]);
    return row === null ? null : mapEvent(row, childId);
  }

  async createActive(session: ActiveSleepSession): Promise<void> {
    const value = createActiveSleepSession(session);
    await this.database.runAsync(`
      INSERT INTO active_sleep_sessions (child_id, id, started_at_epoch_ms)
      VALUES (?, ?, ?);
    `, [value.childId, value.id, value.startedAtEpochMs]);
  }

  async complete(session: ActiveSleepSession, event: SleepEvent): Promise<void> {
    const active = createActiveSleepSession(session);
    const completed = createSleepEvent(event);
    if (
      completed.id !== active.id ||
      completed.childId !== active.childId ||
      completed.startedAtEpochMs !== active.startedAtEpochMs
    ) {
      throw new Error('Sleep event does not match active session.');
    }

    let transactionStarted = false;
    try {
      await this.database.execAsync('BEGIN IMMEDIATE;');
      transactionStarted = true;
      const stored = await this.database.getFirstAsync<ActiveRow>(SELECT_ACTIVE, [active.childId]);
      if (stored === null || mapActive(stored, active.childId).id !== active.id) {
        throw new Error('Active sleep session no longer exists.');
      }
      await this.database.runAsync(`
        INSERT INTO sleep_events (id, child_id, started_at_epoch_ms, ended_at_epoch_ms)
        VALUES (?, ?, ?, ?);
      `, [completed.id, completed.childId, completed.startedAtEpochMs, completed.endedAtEpochMs]);
      const result = await this.database.runAsync(`
        DELETE FROM active_sleep_sessions
        WHERE child_id = ? AND id = ?;
      `, [active.childId, active.id]);
      if (result.changes !== 1) throw new Error('Active sleep session was not cleared.');
      await this.database.execAsync('COMMIT;');
    } catch (error) {
      if (transactionStarted) {
        try { await this.database.execAsync('ROLLBACK;'); } catch {
          // Preserve the original or uncertain COMMIT failure.
        }
      }
      throw error;
    }
  }

  async discard(childId: string, sessionId: string): Promise<void> {
    const result = await this.database.runAsync(`
      DELETE FROM active_sleep_sessions
      WHERE child_id = ? AND id = ?;
    `, [childId, sessionId]);
    if (result.changes !== 1) throw new Error('Active sleep session was not discarded.');
  }

  async listRecentByChildId(
    childId: string,
    limit: number,
  ): Promise<readonly SleepEvent[]> {
    if (childId.trim().length === 0 || !Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Invalid sleep history query.');
    }
    const rows = await this.database.getAllAsync<EventRow>(SELECT_RECENT, [childId, limit]);
    return rows.map((row) => mapEvent(row, childId));
  }
}
