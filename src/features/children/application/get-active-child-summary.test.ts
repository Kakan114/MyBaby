import { describe, expect, it, vi } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import type { ActiveChildRepository } from './active-child-repository';
import type { ChildRepository } from './child-repository';
import { getActiveChildSummary } from './get-active-child-summary';

function fixture(dateOfBirth = '2024-02-29') {
  const child: Child = {
    id: 'child-1',
    displayName: 'Mio',
    dateOfBirth: createCalendarDate(dateOfBirth),
  };
  let selected: string | null = child.id;
  const activeChildRepository: ActiveChildRepository = {
    getActiveChildId: vi.fn(async () => selected),
    setActiveChildId: async (id) => { selected = id; },
    setActiveChildIdIfUnset: async (id) => { selected ??= id; },
    clearActiveChildIdIfMatches: vi.fn(async (id) => {
      if (selected === id) selected = null;
    }),
  };
  const childRepository: ChildRepository = {
    getById: vi.fn(async (id) => id === child.id ? child : null),
    hasChildren: vi.fn(async () => true),
    save: vi.fn(async () => undefined),
  };
  return { child, activeChildRepository, childRepository };
}

describe('active child summary', () => {
  it('returns the real child with the domain leap-day age', async () => {
    const dependencies = fixture();
    await expect(getActiveChildSummary(dependencies, createCalendarDate('2025-02-28')))
      .resolves.toEqual({ child: dependencies.child, age: { years: 1, months: 0, days: 0, fullDays: 365, fullWeeks: 52, remainingWeekDays: 1 } });
  });

  it('uses the supplied reference date at a month boundary', async () => {
    const dependencies = fixture('2025-01-31');
    await expect(getActiveChildSummary(dependencies, createCalendarDate('2025-02-28')))
      .resolves.toMatchObject({ age: { years: 0, months: 1, days: 0 } });
  });

  it('returns null for no selection without checking onboarding', async () => {
    const dependencies = fixture();
    vi.mocked(dependencies.activeChildRepository.getActiveChildId).mockResolvedValue(null);
    await expect(getActiveChildSummary(dependencies, createCalendarDate('2025-02-28')))
      .resolves.toBeNull();
    expect(dependencies.childRepository.getById).not.toHaveBeenCalled();
    expect(dependencies.childRepository.hasChildren).not.toHaveBeenCalled();
  });

  it('reuses conditional stale-selection cleanup', async () => {
    const dependencies = fixture();
    await dependencies.activeChildRepository.setActiveChildId('missing');
    await expect(getActiveChildSummary(dependencies, createCalendarDate('2025-02-28')))
      .resolves.toBeNull();
    expect(dependencies.activeChildRepository.clearActiveChildIdIfMatches)
      .toHaveBeenCalledWith('missing');
  });

  it('rejects a reference date before birth instead of inventing an age', async () => {
    await expect(getActiveChildSummary(fixture(), createCalendarDate('2024-02-28')))
      .rejects.toBeInstanceOf(RangeError);
  });

  it('propagates failures for the runtime boundary to sanitize', async () => {
    const dependencies = fixture();
    const failure = new Error('private infrastructure details');
    vi.mocked(dependencies.childRepository.getById).mockRejectedValue(failure);
    await expect(getActiveChildSummary(dependencies, createCalendarDate('2025-02-28')))
      .rejects.toBe(failure);
  });
});

describe('active newborn summary', () => {
  it('exposes precise structured age using the supplied date', async () => {
    const dependencies = fixture('2025-01-01');
    await expect(getActiveChildSummary(dependencies, createCalendarDate('2025-01-26')))
      .resolves.toEqual({
        child: dependencies.child,
        age: { years: 0, months: 0, days: 25, fullDays: 25, fullWeeks: 3, remainingWeekDays: 4 },
      });
  });
});
