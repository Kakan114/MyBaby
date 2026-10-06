import { describe, expect, it, vi } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import type { ChildRepository } from './child-repository';
import { listChildren } from './list-children';

const olderChild: Child = {
  id: 'child-older',
  displayName: 'Mira',
  dateOfBirth: createCalendarDate('2023-05-10'),
};
const youngerChild: Child = {
  id: 'child-younger',
  displayName: 'Mio',
  dateOfBirth: createCalendarDate('2025-01-10'),
};

function createRepository(children: readonly Child[]): ChildRepository {
  return {
    getById: vi.fn(async () => null),
    hasChildren: vi.fn(async () => children.length > 0),
    listChildren: vi.fn(async () => children),
    save: vi.fn(async () => undefined),
  };
}

describe('list children', () => {
  it.each([
    { name: 'empty', children: [] },
    { name: 'one child', children: [youngerChild] },
    { name: 'multiple children', children: [youngerChild, olderChild] },
  ] as const)('returns the repository order for $name', async ({ children }) => {
    const repository = createRepository(children);

    await expect(listChildren(repository)).resolves.toEqual(children);
    expect(repository.listChildren).toHaveBeenCalledOnce();
  });
});
