import { describe, expect, it, vi } from 'vitest';

import type { SleepRepository } from './sleep-repository';
import { completeSleep, discardSleep, listRecentSleep, startSleep } from './sleep';
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
});
