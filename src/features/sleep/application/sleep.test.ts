import { describe, expect, it, vi } from 'vitest';

import type { SleepRepository } from './sleep-repository';
import {
  completeSleep,
  discardSleep,
  listRecentSleep,
  recordCompletedSleep,
  startSleep,
} from './sleep';
import type { ActiveSleepSession, SleepEvent } from '../domain/sleep';

function fakeRepository() {
  const active = new Map<string, ActiveSleepSession>();
  const events = new Map<string, SleepEvent>();
  const repository: SleepRepository = {
    async getActiveByChildId(id) { return active.get(id) ?? null; },
    async getEventById(childId, id) {
      const event = events.get(id);
      return event?.childId === childId ? event : null;
    },
    async saveCompleted(value) { events.set(value.id, value); },
    async createActive(value) { active.set(value.childId, value); },
    async complete(session, event) { events.set(event.id, event); active.delete(session.childId); },
    async discard(childId) { active.delete(childId); },
    async listRecentByChildId(childId, limit) {
      return [...events.values()].filter((event) => event.childId === childId).slice(0, limit);
    },
  };
  return { active, events, repository };
}

describe('sleep application', () => {
  it('starts once per child and returns the canonical existing session', async () => {
    const { repository } = fakeRepository();
    const generator = { generate: vi.fn(() => 'sleep-1') };
    const first = await startSleep({ repository, idGenerator: generator }, 'child-1', 10);
    const second = await startSleep({ repository, idGenerator: generator }, 'child-1', 20);
    expect(second).toEqual(first);
    expect(generator.generate).toHaveBeenCalledOnce();
  });

  it('keeps active sessions isolated per child', async () => {
    const { repository } = fakeRepository();
    let next = 0;
    const generator = { generate: () => `sleep-${++next}` };
    const a = await startSleep({ repository, idGenerator: generator }, 'a', 10);
    const b = await startSleep({ repository, idGenerator: generator }, 'b', 20);
    expect(a.childId).toBe('a');
    expect(b.childId).toBe('b');
    await expect(repository.getActiveByChildId('a')).resolves.toEqual(a);
  });

  it('completes with the same ID and rejects backward time', async () => {
    const { repository } = fakeRepository();
    const session = { id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 10 };
    await repository.createActive(session);
    await expect(completeSleep(repository, session, 9)).rejects.toMatchObject({
      code: 'clock-moved-backward',
    });
    const event = await completeSleep(repository, session, 20);
    expect(event).toEqual({ ...session, endedAtEpochMs: 20 });
  });

  it('reconciles uncertain start, completion, and discard outcomes', async () => {
    const { active, events, repository } = fakeRepository();
    repository.createActive = vi.fn(async (session) => {
      active.set(session.childId, session);
      throw new Error('uncertain');
    });
    const session = await startSleep({
      repository, idGenerator: { generate: () => 'sleep-1' },
    }, 'child-1', 10);
    repository.createActive = async (value) => { active.set(value.childId, value); };
    repository.complete = vi.fn(async (_session, event) => {
      events.set(event.id, event); active.delete(event.childId); throw new Error('uncertain');
    });
    await expect(completeSleep(repository, session, 20)).resolves.toMatchObject({ id: 'sleep-1' });
    await repository.createActive(session);
    repository.discard = vi.fn(async (childId) => {
      active.delete(childId); throw new Error('uncertain');
    });
    await expect(discardSleep(repository, session)).resolves.toBeUndefined();
  });

  it('uses the product-owned recent limit', async () => {
    const { repository } = fakeRepository();
    const list = vi.spyOn(repository, 'listRecentByChildId');
    await listRecentSleep(repository, 'child-1');
    expect(list).toHaveBeenCalledWith('child-1', 20);
  });

  it('records a normal completed event without changing an active session', async () => {
    const { active, events, repository } = fakeRepository();
    active.set('child-1', {
      id: 'active', childId: 'child-1', startedAtEpochMs: 1_000,
    });
    const event = await recordCompletedSleep(
      { repository, idGenerator: { generate: () => 'manual-1' } },
      'child-1', 100, 1_000, 2_000,
    );
    expect(event).toEqual({
      id: 'manual-1', childId: 'child-1', startedAtEpochMs: 100,
      endedAtEpochMs: 1_000,
    });
    expect(active.get('child-1')?.id).toBe('active');
    expect(events.get('manual-1')).toEqual(event);
  });

  it('rejects future and active-session-overlapping completed events', async () => {
    const { active, repository } = fakeRepository();
    active.set('child-1', {
      id: 'active', childId: 'child-1', startedAtEpochMs: 1_000,
    });
    const dependencies = {
      repository, idGenerator: { generate: () => 'manual-1' },
    };
    await expect(recordCompletedSleep(
      dependencies, 'child-1', 100, 2_001, 2_000,
    )).rejects.toMatchObject({ code: 'future-completed-sleep' });
    await expect(recordCompletedSleep(
      dependencies, 'child-1', 100, 1_001, 2_000,
    )).rejects.toMatchObject({ code: 'overlaps-active-sleep' });
  });

  it('reconciles exact manual writes and classifies absent or mismatched outcomes', async () => {
    const exact = fakeRepository();
    exact.repository.saveCompleted = vi.fn(async (event) => {
      exact.events.set(event.id, event);
      throw new Error('uncertain');
    });
    await expect(recordCompletedSleep(
      { repository: exact.repository, idGenerator: { generate: () => 'manual-1' } },
      'child-1', 100, 200, 300,
    )).resolves.toMatchObject({ id: 'manual-1' });

    const absent = fakeRepository();
    absent.repository.saveCompleted = vi.fn(async () => { throw new Error('failed'); });
    await expect(recordCompletedSleep(
      { repository: absent.repository, idGenerator: { generate: () => 'manual-2' } },
      'child-1', 100, 200, 300,
    )).rejects.toMatchObject({ code: 'completed-sleep-not-saved' });

    const mismatch = fakeRepository();
    mismatch.repository.saveCompleted = vi.fn(async (event) => {
      mismatch.events.set(event.id, { ...event, endedAtEpochMs: 201 });
      throw new Error('uncertain');
    });
    await expect(recordCompletedSleep(
      { repository: mismatch.repository, idGenerator: { generate: () => 'manual-3' } },
      'child-1', 100, 200, 300,
    )).rejects.toMatchObject({ code: 'completed-sleep-outcome-uncertain' });

    const unreadable = fakeRepository();
    unreadable.repository.saveCompleted = vi.fn(async () => { throw new Error('failed'); });
    unreadable.repository.getEventById = vi.fn(async () => { throw new Error('failed'); });
    await expect(recordCompletedSleep(
      { repository: unreadable.repository, idGenerator: { generate: () => 'manual-4' } },
      'child-1', 100, 200, 300,
    )).rejects.toMatchObject({ code: 'completed-sleep-outcome-uncertain' });
  });
});
