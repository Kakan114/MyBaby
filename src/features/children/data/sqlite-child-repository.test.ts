import { describe, expect, it } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import {
  SqliteChildRepository,
  type ChildRepositoryDatabase,
} from './sqlite-child-repository';

type StoredChildRow = {
  id: string;
  display_name: string;
  date_of_birth: string;
};

class FakeChildDatabase implements ChildRepositoryDatabase {
  readonly rows = new Map<string, StoredChildRow>();
  readonly reads: Array<{ source: string; params: readonly unknown[] }> = [];
  readonly writes: Array<{ source: string; params: readonly unknown[] }> = [];

  async getFirstAsync<T>(source: string, params: unknown[]): Promise<T | null> {
    this.reads.push({ source, params });
    return (this.rows.get(String(params[0])) ?? null) as T | null;
  }

  async runAsync(source: string, params: unknown[]): Promise<unknown> {
    this.writes.push({ source, params });
    const [id, displayName, dateOfBirth] = params.map(String);
    this.rows.set(id, {
      id,
      display_name: displayName,
      date_of_birth: dateOfBirth,
    });
    return undefined;
  }
}

const child: Child = {
  id: 'child-1',
  displayName: 'Mira',
  dateOfBirth: createCalendarDate('2025-02-28'),
};

describe('SQLite child repository', () => {
  it('returns null when the child does not exist and binds the ID', async () => {
    const database = new FakeChildDatabase();
    const repository = new SqliteChildRepository(database);

    await expect(repository.getById('missing-child')).resolves.toBeNull();
    expect(database.reads).toHaveLength(1);
    expect(database.reads[0].params).toEqual(['missing-child']);
    expect(database.reads[0].source).toContain('WHERE id = ?');
    expect(database.reads[0].source).not.toContain('missing-child');
  });

  it('maps a row to Child and preserves CalendarDate exactly', async () => {
    const database = new FakeChildDatabase();
    database.rows.set(child.id, {
      id: child.id,
      display_name: child.displayName,
      date_of_birth: child.dateOfBirth,
    });
    const repository = new SqliteChildRepository(database);

    await expect(repository.getById(child.id)).resolves.toEqual(child);
    expect((await repository.getById(child.id))?.dateOfBirth).toBe('2025-02-28');
  });

  it('rejects an invalid CalendarDate stored in the database', async () => {
    const database = new FakeChildDatabase();
    database.rows.set(child.id, {
      id: child.id,
      display_name: child.displayName,
      date_of_birth: '2025-02-29',
    });
    const repository = new SqliteChildRepository(database);

    await expect(repository.getById(child.id)).rejects.toThrow(RangeError);
  });

  it('upserts by ID using bound values and only the three Child fields', async () => {
    const database = new FakeChildDatabase();
    const repository = new SqliteChildRepository(database);

    await repository.save(child);
    const updatedChild: Child = {
      ...child,
      displayName: 'Mira Updated',
      dateOfBirth: createCalendarDate('2025-03-01'),
    };
    await repository.save(updatedChild);

    expect(database.rows).toHaveLength(1);
    await expect(repository.getById(child.id)).resolves.toEqual(updatedChild);
    expect(database.writes).toHaveLength(2);
    expect(database.writes[1].params).toEqual([
      updatedChild.id,
      updatedChild.displayName,
      updatedChild.dateOfBirth,
    ]);
    expect(database.writes[1].params).toHaveLength(3);
    expect(database.writes[1].source).toContain(
      'INSERT INTO children (id, display_name, date_of_birth)',
    );
    expect(database.writes[1].source).toContain('ON CONFLICT(id) DO UPDATE SET');
    expect(database.writes[1].source).not.toContain('REPLACE');
    expect(database.writes[1].source).not.toContain(updatedChild.displayName);
  });
});
