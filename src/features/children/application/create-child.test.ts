import { describe, expect, it } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import type { ChildIdGenerator } from './child-id-generator';
import type { ChildRepository } from './child-repository';
import { createChildUseCase } from './create-child';

class FakeChildRepository implements ChildRepository {
  readonly savedChildren: Child[] = [];

  async getById(id: string): Promise<Child | null> {
    return this.savedChildren.find((child) => child.id === id) ?? null;
  }

  async save(child: Child): Promise<void> {
    this.savedChildren.push(child);
  }
}

function createIdGenerator(id: string): ChildIdGenerator {
  return { generate: () => id };
}

const asOf = createCalendarDate('2025-06-15');

describe('createChildUseCase', () => {
  it('creates a valid child and saves it through the repository', async () => {
    const childRepository = new FakeChildRepository();

    const child = await createChildUseCase(
      { childRepository, childIdGenerator: createIdGenerator('generated-child-id') },
      { displayName: 'Kim', dateOfBirth: '2025-01-10' },
      asOf,
    );

    expect(childRepository.savedChildren).toEqual([child]);
  });

  it('uses the domain trimming for the display name', async () => {
    const childRepository = new FakeChildRepository();

    const child = await createChildUseCase(
      { childRepository, childIdGenerator: createIdGenerator('generated-child-id') },
      { displayName: '  Kim  ', dateOfBirth: '2025-01-10' },
      asOf,
    );

    expect(child.displayName).toBe('Kim');
  });

  it('uses the id supplied by the injected generator', async () => {
    const childRepository = new FakeChildRepository();

    const child = await createChildUseCase(
      { childRepository, childIdGenerator: createIdGenerator('generated-child-id') },
      { displayName: 'Kim', dateOfBirth: '2025-01-10' },
      asOf,
    );

    expect(child.id).toBe('generated-child-id');
  });

  it('does not save a child rejected by domain validation', async () => {
    const childRepository = new FakeChildRepository();

    await expect(
      createChildUseCase(
        { childRepository, childIdGenerator: createIdGenerator('generated-child-id') },
        { displayName: '   ', dateOfBirth: '2025-01-10' },
        asOf,
      ),
    ).rejects.toThrow(TypeError);
    expect(childRepository.savedChildren).toHaveLength(0);
  });

  it('does not save a child with a future date of birth', async () => {
    const childRepository = new FakeChildRepository();

    await expect(
      createChildUseCase(
        { childRepository, childIdGenerator: createIdGenerator('generated-child-id') },
        { displayName: 'Kim', dateOfBirth: '2025-06-16' },
        asOf,
      ),
    ).rejects.toThrow(RangeError);
    expect(childRepository.savedChildren).toHaveLength(0);
  });
});
