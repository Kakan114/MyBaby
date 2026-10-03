import { describe, expect, it } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import type { ActiveChildRepository } from './active-child-repository';
import { ActiveChildError, getActiveChild, setActiveChild } from './active-child';
import type { ChildRepository } from './child-repository';

class FakeActiveChildRepository implements ActiveChildRepository {
  activeChildId: string | null = null;
  readonly clearedIds: string[] = [];

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
    this.clearedIds.push(id);
    if (this.activeChildId === id) {
      this.activeChildId = null;
    }
  }
}

class FakeChildRepository implements ChildRepository {
  readonly children = new Map<string, Child>();
  onGetById?: () => void;

  async getById(id: string): Promise<Child | null> {
    this.onGetById?.();
    return this.children.get(id) ?? null;
  }

  async save(child: Child): Promise<void> {
    this.children.set(child.id, child);
  }
}

const child: Child = {
  id: 'child-1',
  displayName: 'Kim',
  dateOfBirth: createCalendarDate('2025-01-10'),
};

describe('active child application behavior', () => {
  it('returns null when no active selection exists', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    const childRepository = new FakeChildRepository();

    await expect(
      getActiveChild({ activeChildRepository, childRepository }),
    ).resolves.toBeNull();
  });

  it('returns the selected child', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    activeChildRepository.activeChildId = child.id;
    const childRepository = new FakeChildRepository();
    childRepository.children.set(child.id, child);

    await expect(
      getActiveChild({ activeChildRepository, childRepository }),
    ).resolves.toBe(child);
  });

  it('conditionally clears a stale selection and returns null', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    activeChildRepository.activeChildId = 'stale-child';
    const childRepository = new FakeChildRepository();

    await expect(
      getActiveChild({ activeChildRepository, childRepository }),
    ).resolves.toBeNull();
    expect(activeChildRepository.clearedIds).toEqual(['stale-child']);
    expect(activeChildRepository.activeChildId).toBeNull();
  });

  it('does not clear a newer selection during stale recovery', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    activeChildRepository.activeChildId = 'stale-child';
    const childRepository = new FakeChildRepository();
    childRepository.onGetById = () => {
      activeChildRepository.activeChildId = 'newer-child';
    };

    await expect(
      getActiveChild({ activeChildRepository, childRepository }),
    ).resolves.toBeNull();
    expect(activeChildRepository.clearedIds).toEqual(['stale-child']);
    expect(activeChildRepository.activeChildId).toBe('newer-child');
  });

  it('sets and returns an existing child', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    const childRepository = new FakeChildRepository();
    childRepository.children.set(child.id, child);

    await expect(
      setActiveChild({ activeChildRepository, childRepository }, child.id),
    ).resolves.toBe(child);
    expect(activeChildRepository.activeChildId).toBe(child.id);
  });

  it('rejects a missing child with a stable application error', async () => {
    const dependencies = {
      activeChildRepository: new FakeActiveChildRepository(),
      childRepository: new FakeChildRepository(),
    };

    const error = await setActiveChild(dependencies, 'missing-child').catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ActiveChildError);
    expect(error).toMatchObject({ code: 'child-not-found' });
    expect(dependencies.activeChildRepository.activeChildId).toBeNull();
  });
});
