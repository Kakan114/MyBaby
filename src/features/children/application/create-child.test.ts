import { describe, expect, it } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import type { ActiveChildRepository } from './active-child-repository';
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

class FakeActiveChildRepository implements ActiveChildRepository {
  activeChildId: string | null = null;

  async getActiveChildId(): Promise<string | null> {
    return this.activeChildId;
  }

  async setActiveChildId(id: string): Promise<void> {
    this.activeChildId = id;
  }

  async setActiveChildIdIfUnset(id: string): Promise<void> {
    this.activeChildId ??= id;
  }

  async clearActiveChildIdIfMatches(id: string): Promise<void> {
    if (this.activeChildId === id) {
      this.activeChildId = null;
    }
  }
}

function createIdGenerator(id: string): ChildIdGenerator {
  return { generate: () => id };
}

const asOf = createCalendarDate('2025-06-15');

function createDependencies(childRepository: ChildRepository) {
  return {
    activeChildRepository: new FakeActiveChildRepository(),
    childRepository,
    childIdGenerator: createIdGenerator('generated-child-id'),
  };
}

describe('createChildUseCase', () => {
  it('creates a valid child and saves it through the repository', async () => {
    const childRepository = new FakeChildRepository();

    const child = await createChildUseCase(
      createDependencies(childRepository),
      { displayName: 'Kim', dateOfBirth: '2025-01-10' },
      asOf,
    );

    expect(childRepository.savedChildren).toEqual([child]);
  });

  it('uses the domain trimming for the display name', async () => {
    const childRepository = new FakeChildRepository();

    const child = await createChildUseCase(
      createDependencies(childRepository),
      { displayName: '  Kim  ', dateOfBirth: '2025-01-10' },
      asOf,
    );

    expect(child.displayName).toBe('Kim');
  });

  it('uses the id supplied by the injected generator', async () => {
    const childRepository = new FakeChildRepository();

    const child = await createChildUseCase(
      createDependencies(childRepository),
      { displayName: 'Kim', dateOfBirth: '2025-01-10' },
      asOf,
    );

    expect(child.id).toBe('generated-child-id');
  });

  it('does not save a child rejected by domain validation', async () => {
    const childRepository = new FakeChildRepository();

    await expect(
      createChildUseCase(
        createDependencies(childRepository),
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
        createDependencies(childRepository),
        { displayName: 'Kim', dateOfBirth: '2025-06-16' },
        asOf,
      ),
    ).rejects.toThrow(RangeError);
    expect(childRepository.savedChildren).toHaveLength(0);
  });

  it('sets the first created child active without replacing an existing selection', async () => {
    const childRepository = new FakeChildRepository();
    const activeChildRepository = new FakeActiveChildRepository();
    const dependencies = {
      activeChildRepository,
      childRepository,
      childIdGenerator: createIdGenerator('first-child'),
    };

    await createChildUseCase(
      dependencies,
      { displayName: 'First', dateOfBirth: '2025-01-10' },
      asOf,
    );
    expect(activeChildRepository.activeChildId).toBe('first-child');

    await createChildUseCase(
      { ...dependencies, childIdGenerator: createIdGenerator('second-child') },
      { displayName: 'Second', dateOfBirth: '2025-02-10' },
      asOf,
    );
    expect(activeChildRepository.activeChildId).toBe('first-child');
  });
});
