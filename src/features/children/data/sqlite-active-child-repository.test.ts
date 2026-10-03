import { describe, expect, it } from 'vitest';

import {
  SqliteActiveChildRepository,
  type ActiveChildRepositoryDatabase,
} from './sqlite-active-child-repository';

class FakeActiveChildDatabase implements ActiveChildRepositoryDatabase {
  activeChildId: string | null = null;
  readonly reads: Array<{ source: string; params: readonly unknown[] }> = [];
  readonly writes: Array<{ source: string; params: readonly unknown[] }> = [];

  async getFirstAsync<T>(source: string, params: unknown[]): Promise<T | null> {
    this.reads.push({ source, params });
    return (this.activeChildId === null
      ? null
      : { child_id: this.activeChildId }) as T | null;
  }

  async runAsync(source: string, params: unknown[]): Promise<unknown> {
    this.writes.push({ source, params });
    const childId = String(params[1]);

    if (source.includes('DO UPDATE SET')) {
      this.activeChildId = childId;
    } else if (source.includes('DO NOTHING')) {
      this.activeChildId ??= childId;
    } else if (
      source.includes('DELETE FROM') &&
      this.activeChildId === childId
    ) {
      this.activeChildId = null;
    }

    return undefined;
  }
}

describe('SQLite active child repository', () => {
  it('reads the singleton selection with a bound ID', async () => {
    const database = new FakeActiveChildDatabase();
    database.activeChildId = 'child-1';
    const repository = new SqliteActiveChildRepository(database);

    await expect(repository.getActiveChildId()).resolves.toBe('child-1');
    expect(database.reads).toHaveLength(1);
    expect(database.reads[0].params).toEqual([1]);
    expect(database.reads[0].source).toContain('WHERE id = ?');
    expect(database.reads[0].source).not.toContain('child-1');
  });

  it('returns null when the singleton selection does not exist', async () => {
    const repository = new SqliteActiveChildRepository(
      new FakeActiveChildDatabase(),
    );

    await expect(repository.getActiveChildId()).resolves.toBeNull();
  });

  it('explicitly replaces the singleton selection using bound values', async () => {
    const database = new FakeActiveChildDatabase();
    database.activeChildId = 'old-child';
    const repository = new SqliteActiveChildRepository(database);

    await repository.setActiveChildId('new-child');

    expect(database.activeChildId).toBe('new-child');
    expect(database.writes[0].params).toEqual([1, 'new-child']);
    expect(database.writes[0].source).toContain('ON CONFLICT(id) DO UPDATE SET');
    expect(database.writes[0].source).not.toContain('new-child');
  });

  it('keeps the first selection during concurrent default attempts', async () => {
    const database = new FakeActiveChildDatabase();
    const repository = new SqliteActiveChildRepository(database);

    await Promise.all([
      repository.setActiveChildIdIfUnset('first-child'),
      repository.setActiveChildIdIfUnset('second-child'),
    ]);

    expect(database.activeChildId).toBe('first-child');
    expect(database.writes).toHaveLength(2);
    expect(database.writes[0].source).toContain('ON CONFLICT(id) DO NOTHING');
    expect(database.writes[0].params).toEqual([1, 'first-child']);
  });

  it('clears only the expected selection using bound values', async () => {
    const database = new FakeActiveChildDatabase();
    database.activeChildId = 'newer-child';
    const repository = new SqliteActiveChildRepository(database);

    await repository.clearActiveChildIdIfMatches('stale-child');
    expect(database.activeChildId).toBe('newer-child');

    await repository.clearActiveChildIdIfMatches('newer-child');
    expect(database.activeChildId).toBeNull();
    expect(database.writes[0].params).toEqual([1, 'stale-child']);
    expect(database.writes[0].source).toContain(
      'WHERE id = ? AND child_id = ?',
    );
    expect(database.writes[0].source).not.toContain('stale-child');
  });
});
