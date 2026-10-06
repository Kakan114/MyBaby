import { describe, expect, it, vi } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import type { ActiveChildRepository } from './active-child-repository';
import type { ChildRepository } from './child-repository';
import { getChildrenBootstrapStatus } from './get-children-bootstrap-status';

class FakeActiveChildRepository implements ActiveChildRepository {
  activeChildId: string | null = null;
  readonly clearActiveChildIdIfMatches = vi.fn(async (id: string) => {
    if (this.activeChildId === id) {
      this.activeChildId = null;
    }
  });

  async getActiveChildId(): Promise<string | null> {
    return this.activeChildId;
  }

  async setActiveChildId(id: string): Promise<void> {
    this.activeChildId = id;
  }

  async setActiveChildIdIfUnset(id: string): Promise<void> {
    this.activeChildId ??= id;
  }
}

class FakeChildRepository implements ChildRepository {
  readonly children = new Map<string, Child>();
  readonly hasChildren = vi.fn(async () => this.children.size > 0);

  async getById(id: string): Promise<Child | null> {
    return this.children.get(id) ?? null;
  }

  async listChildren(): Promise<readonly Child[]> {
    return [...this.children.values()];
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

describe('children bootstrap status', () => {
  it('is ready when an active child resolves without checking existence', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    activeChildRepository.activeChildId = child.id;
    const childRepository = new FakeChildRepository();
    childRepository.children.set(child.id, child);

    await expect(
      getChildrenBootstrapStatus({ activeChildRepository, childRepository }),
    ).resolves.toEqual({ status: 'ready' });
    expect(childRepository.hasChildren).not.toHaveBeenCalled();
  });

  it('requires onboarding only when no active child and no children exist', async () => {
    const dependencies = {
      activeChildRepository: new FakeActiveChildRepository(),
      childRepository: new FakeChildRepository(),
    };

    await expect(getChildrenBootstrapStatus(dependencies)).resolves.toEqual({
      status: 'onboarding-required',
    });
    expect(dependencies.childRepository.hasChildren).toHaveBeenCalledOnce();
  });

  it('requires active selection when children exist without a selection', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    const childRepository = new FakeChildRepository();
    childRepository.children.set(child.id, child);

    await expect(
      getChildrenBootstrapStatus({ activeChildRepository, childRepository }),
    ).resolves.toEqual({ status: 'active-selection-required' });
  });

  it('reuses stale-selection recovery before deciding status', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    activeChildRepository.activeChildId = 'stale-child';
    const childRepository = new FakeChildRepository();
    childRepository.children.set(child.id, child);

    await expect(
      getChildrenBootstrapStatus({ activeChildRepository, childRepository }),
    ).resolves.toEqual({ status: 'active-selection-required' });
    expect(
      activeChildRepository.clearActiveChildIdIfMatches,
    ).toHaveBeenCalledWith('stale-child');
    expect(activeChildRepository.activeChildId).toBeNull();
  });

  it('requires onboarding after stale recovery when no children remain', async () => {
    const activeChildRepository = new FakeActiveChildRepository();
    activeChildRepository.activeChildId = 'stale-child';
    const childRepository = new FakeChildRepository();

    await expect(
      getChildrenBootstrapStatus({ activeChildRepository, childRepository }),
    ).resolves.toEqual({ status: 'onboarding-required' });
    expect(
      activeChildRepository.clearActiveChildIdIfMatches,
    ).toHaveBeenCalledWith('stale-child');
  });
});
