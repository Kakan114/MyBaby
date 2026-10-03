import type { ActiveChildRepository } from '../application/active-child-repository';

type ActiveChildRepositoryBindValue =
  | string
  | number
  | null
  | boolean
  | Uint8Array
  | ArrayBuffer;

export interface ActiveChildRepositoryDatabase {
  getFirstAsync<T>(
    source: string,
    params: ActiveChildRepositoryBindValue[],
  ): Promise<T | null>;
  runAsync(
    source: string,
    params: ActiveChildRepositoryBindValue[],
  ): Promise<unknown>;
}

type ActiveChildRow = { child_id: string };

const GET_ACTIVE_CHILD_ID = `
  SELECT child_id
  FROM active_child_selection
  WHERE id = ?;
`;

const SET_ACTIVE_CHILD_ID = `
  INSERT INTO active_child_selection (id, child_id)
  VALUES (?, ?)
  ON CONFLICT(id) DO UPDATE SET
    child_id = excluded.child_id;
`;

const SET_ACTIVE_CHILD_ID_IF_UNSET = `
  INSERT INTO active_child_selection (id, child_id)
  VALUES (?, ?)
  ON CONFLICT(id) DO NOTHING;
`;

const CLEAR_ACTIVE_CHILD_ID_IF_MATCHES = `
  DELETE FROM active_child_selection
  WHERE id = ? AND child_id = ?;
`;

const ACTIVE_CHILD_SINGLETON_ID = 1;

export class SqliteActiveChildRepository implements ActiveChildRepository {
  constructor(private readonly database: ActiveChildRepositoryDatabase) {}

  async getActiveChildId(): Promise<string | null> {
    const row = await this.database.getFirstAsync<ActiveChildRow>(
      GET_ACTIVE_CHILD_ID,
      [ACTIVE_CHILD_SINGLETON_ID],
    );

    return row?.child_id ?? null;
  }

  async setActiveChildId(id: string): Promise<void> {
    await this.database.runAsync(SET_ACTIVE_CHILD_ID, [
      ACTIVE_CHILD_SINGLETON_ID,
      id,
    ]);
  }

  async setActiveChildIdIfUnset(id: string): Promise<void> {
    await this.database.runAsync(SET_ACTIVE_CHILD_ID_IF_UNSET, [
      ACTIVE_CHILD_SINGLETON_ID,
      id,
    ]);
  }

  async clearActiveChildIdIfMatches(id: string): Promise<void> {
    await this.database.runAsync(CLEAR_ACTIVE_CHILD_ID_IF_MATCHES, [
      ACTIVE_CHILD_SINGLETON_ID,
      id,
    ]);
  }
}
