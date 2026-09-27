import { describe, expect, it } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import { createChild, type Child } from '../domain/child';
import type { ChildRepository } from './child-repository';
import { getChildById } from './get-child-by-id';

class FakeChildRepository implements ChildRepository {
  constructor(private readonly children: Child[]) {}

  async getById(id: string): Promise<Child | null> {
    return this.children.find((child) => child.id === id) ?? null;
  }

  async save(child: Child): Promise<void> {
    this.children.push(child);
  }
}

describe('getChildById', () => {
  it('returns an existing child from the repository', async () => {
    const asOf = createCalendarDate('2025-06-15');
    const child = createChild(
      { id: 'existing-child-id', displayName: 'Kim', dateOfBirth: '2025-01-10' },
      asOf,
    );
    const repository = new FakeChildRepository([child]);

    await expect(getChildById(repository, child.id)).resolves.toBe(child);
  });

  it('returns null when the child does not exist', async () => {
    const repository = new FakeChildRepository([]);

    await expect(getChildById(repository, 'missing-child-id')).resolves.toBeNull();
  });
});
