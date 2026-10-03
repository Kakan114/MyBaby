import type { ChildRepository } from '../application/child-repository';
import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';

type ChildRepositoryBindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

export interface ChildRepositoryDatabase {
  getFirstAsync<T>(source: string, params: ChildRepositoryBindValue[]): Promise<T | null>;
  runAsync(source: string, params: ChildRepositoryBindValue[]): Promise<unknown>;
}

type ChildRow = {
  id: string;
  display_name: string;
  date_of_birth: string;
};

const SELECT_CHILD_BY_ID = `
  SELECT id, display_name, date_of_birth
  FROM children
  WHERE id = ?;
`;

const UPSERT_CHILD = `
  INSERT INTO children (id, display_name, date_of_birth)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    display_name = excluded.display_name,
    date_of_birth = excluded.date_of_birth;
`;

function mapChildRow(row: ChildRow): Child {
  return {
    id: row.id,
    displayName: row.display_name,
    dateOfBirth: createCalendarDate(row.date_of_birth),
  };
}

export class SqliteChildRepository implements ChildRepository {
  constructor(private readonly database: ChildRepositoryDatabase) {}

  async getById(id: string): Promise<Child | null> {
    const row = await this.database.getFirstAsync<ChildRow>(SELECT_CHILD_BY_ID, [id]);

    return row === null ? null : mapChildRow(row);
  }

  async save(child: Child): Promise<void> {
    await this.database.runAsync(UPSERT_CHILD, [
      child.id,
      child.displayName,
      child.dateOfBirth,
    ]);
  }
}
