import { describe, expect, it, vi } from 'vitest';

import type { ActiveChildRepository } from '../features/children/application/active-child-repository';
import { ActiveChildError } from '../features/children/application/active-child';
import type { ChildRepository } from '../features/children/application/child-repository';
import {
  CalendarDateValidationError,
  createCalendarDate,
  type CalendarDate,
} from '../features/children/domain/calendar-date';
import {
  ChildValidationError,
  type Child,
} from '../features/children/domain/child';
import type { FeedingRepository } from '../features/feeding/application/feeding-repository';
import type { BreastfeedingTimerRepository } from '../features/feeding/application/breastfeeding-timer-repository';
import type { FeedingEvent } from '../features/feeding/domain/feeding-event';
import type { BreastfeedingTimerSession } from '../features/feeding/domain/breastfeeding-timer';
import type { SleepRepository } from '../features/sleep/application/sleep-repository';
import type { ActiveSleepSession, SleepEvent } from '../features/sleep/domain/sleep';
import type { DiaperRepository } from '../features/diapers/application/diaper-repository';
import type { DiaperEvent } from '../features/diapers/domain/diaper-event';

import {
  AppRuntimeError,
  createAppRuntime,
  type RuntimeDatabaseConnection,
} from './app-runtime';

class FakeDatabase implements RuntimeDatabaseConnection {
  readonly closeAsync = vi.fn(async () => undefined);
}

class FakeChildRepository implements ChildRepository {
  readonly children = new Map<string, Child>();
  readonly getById = vi.fn(async (id: string) => this.children.get(id) ?? null);
  readonly hasChildren = vi.fn(async () => this.children.size > 0);
  readonly listChildren = vi.fn(async () => [...this.children.values()]);
  readonly save = vi.fn(async (child: Child) => {
    this.children.set(child.id, child);
  });
}

class FakeActiveChildRepository implements ActiveChildRepository {
  activeChildId: string | null = null;
  readonly getActiveChildId = vi.fn(async () => this.activeChildId);
  readonly setActiveChildId = vi.fn(async (id: string) => {
    this.activeChildId = id;
  });
  readonly setActiveChildIdIfUnset = vi.fn(async (id: string) => {
    this.activeChildId ??= id;
  });
  readonly clearActiveChildIdIfMatches = vi.fn(async (id: string) => {
    if (this.activeChildId === id) {
      this.activeChildId = null;
    }
  });
}

class FakeFeedingRepository implements FeedingRepository {
  readonly recentEvents: FeedingEvent[] = [];
  readonly listRecentByChildId = vi.fn(async (childId: string, limit: number) =>
    this.recentEvents
      .filter((event) => event.childId === childId)
      .sort((left, right) =>
        right.occurredAtEpochMs - left.occurredAtEpochMs ||
        right.id.localeCompare(left.id))
      .slice(0, limit));
  readonly save = vi.fn(async (_event: FeedingEvent): Promise<void> => undefined);
}

class FakeBreastfeedingTimerRepository implements BreastfeedingTimerRepository {
  session: BreastfeedingTimerSession | null = null;
  readonly completedEvents: FeedingEvent[] = [];
  readonly get = vi.fn(async () => this.session);
  readonly create = vi.fn(async (session: BreastfeedingTimerSession) => {
    if (this.session !== null) throw new Error('session exists');
    this.session = session;
  });
  readonly replace = vi.fn(async (session: BreastfeedingTimerSession) => {
    if (this.session === null) throw new Error('session missing');
    this.session = session;
  });
  readonly discard = vi.fn(async (sessionId: string) => {
    if (this.session?.sessionId !== sessionId) throw new Error('session missing');
    this.session = null;
  });
  readonly complete = vi.fn(async (_sessionId: string, event: FeedingEvent) => {
    if (this.session === null) throw new Error('session missing');
    this.completedEvents.push(event);
    this.session = null;
  });
}

class FakeSleepRepository implements SleepRepository {
  readonly active = new Map<string, ActiveSleepSession>();
  readonly events: SleepEvent[] = [];
  readonly getActiveByChildId = vi.fn(async (childId: string) => this.active.get(childId) ?? null);
  readonly getEventById = vi.fn(async (childId: string, id: string) => {
    return this.events.find((event) => event.childId === childId && event.id === id) ?? null;
  });
  readonly saveCompleted = vi.fn(async (event: SleepEvent) => {
    this.events.push(event);
  });
  readonly createActive = vi.fn(async (session: ActiveSleepSession) => {
    this.active.set(session.childId, session);
  });
  readonly complete = vi.fn(async (session: ActiveSleepSession, event: SleepEvent) => {
    this.events.push(event); this.active.delete(session.childId);
  });
  readonly discard = vi.fn(async (childId: string) => { this.active.delete(childId); });
  readonly listRecentByChildId = vi.fn(async (childId: string, limit: number) => {
    return this.events.filter((event) => event.childId === childId).slice(0, limit);
  });
}

class FakeDiaperRepository implements DiaperRepository {
  readonly events: DiaperEvent[] = [];
  readonly save = vi.fn(async (event: DiaperEvent) => { this.events.push(event); });
  readonly getById = vi.fn(async (childId: string, id: string) =>
    this.events.find((event) => event.childId === childId && event.id === id) ?? null);
  readonly listRecentByChildId = vi.fn(async (childId: string, limit: number) =>
    this.events.filter((event) => event.childId === childId).slice(0, limit));
  readonly deleteIfMatches = vi.fn(async (expected: DiaperEvent) => {
    const index = this.events.findIndex((event) => event.id === expected.id &&
      event.childId === expected.childId && event.kind === expected.kind &&
      event.occurredAtEpochMs === expected.occurredAtEpochMs);
    if (index < 0) return false;
    this.events.splice(index, 1);
    return true;
  });
  readonly updateIfMatches = vi.fn(async (expected: DiaperEvent, replacement: DiaperEvent) => {
    const index = this.events.findIndex((event) => event.id === expected.id &&
      event.childId === expected.childId && event.kind === expected.kind &&
      event.occurredAtEpochMs === expected.occurredAtEpochMs);
    if (index < 0) return false;
    this.events[index] = replacement;
    return true;
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function createRuntimeFixture(options?: {
  openDatabase?: () => Promise<FakeDatabase>;
  getCurrentCalendarDate?: () => CalendarDate;
  getCurrentEpochMs?: () => number;
  feedingIdGenerator?: { generate(): string };
}) {
  const database = new FakeDatabase();
  const activeChildRepository = new FakeActiveChildRepository();
  const childRepository = new FakeChildRepository();
  const feedingRepository = new FakeFeedingRepository();
  const breastfeedingTimerRepository = new FakeBreastfeedingTimerRepository();
  const sleepRepository = new FakeSleepRepository();
  const diaperRepository = new FakeDiaperRepository();
  const openDatabase = vi.fn(options?.openDatabase ?? (async () => database));
  const createChildRepository = vi.fn(() => childRepository);
  const createActiveChildRepository = vi.fn(() => activeChildRepository);
  const runtime = createAppRuntime({
    openDatabase,
    createActiveChildRepository,
    createChildRepository,
    createFeedingRepository: () => feedingRepository,
    createBreastfeedingTimerRepository: () => breastfeedingTimerRepository,
    createSleepRepository: () => sleepRepository,
    createDiaperRepository: () => diaperRepository,
    childIdGenerator: { generate: () => 'generated-child-id' },
    feedingIdGenerator:
      options?.feedingIdGenerator ?? { generate: () => 'generated-feeding-id' },
    sleepIdGenerator: { generate: () => 'generated-sleep-id' },
    diaperIdGenerator: { generate: () => 'generated-diaper-id' },
    getCurrentCalendarDate: options?.getCurrentCalendarDate ?? (() => asOf),
    getCurrentEpochMs:
      options?.getCurrentEpochMs ?? (() => 1_765_000_000_123),
  });

  return {
    database,
    activeChildRepository,
    childRepository,
    feedingRepository,
    breastfeedingTimerRepository,
    sleepRepository,
    diaperRepository,
    createActiveChildRepository,
    createChildRepository,
    openDatabase,
    runtime,
  };
}

const asOf = createCalendarDate('2025-06-15');

describe('application runtime', () => {
  it('does not initialize local data when the runtime is created', () => {
    const fixture = createRuntimeFixture();

    expect(fixture.openDatabase).not.toHaveBeenCalled();
    expect(fixture.createActiveChildRepository).not.toHaveBeenCalled();
    expect(fixture.createChildRepository).not.toHaveBeenCalled();
  });

  it('shares one pending initialization between concurrent first operations', async () => {
    const deferredDatabase = createDeferred<FakeDatabase>();
    const fixture = createRuntimeFixture({
      openDatabase: () => deferredDatabase.promise,
    });

    const createPromise = fixture.runtime.children.createChild(
      { displayName: 'Kim', dateOfBirth: '2025-01-10' },
    );
    const getPromise = fixture.runtime.children.getChildById('missing-child');

    expect(fixture.openDatabase).toHaveBeenCalledOnce();
    deferredDatabase.resolve(fixture.database);

    await expect(createPromise).resolves.toMatchObject({ id: 'generated-child-id' });
    await expect(getPromise).resolves.toBeNull();
    expect(fixture.createChildRepository).toHaveBeenCalledOnce();
    expect(fixture.createActiveChildRepository).toHaveBeenCalledOnce();
  });

  it('reuses the initialized repository and connection', async () => {
    const fixture = createRuntimeFixture();

    await fixture.runtime.children.getChildById('first');
    await fixture.runtime.children.getChildById('second');

    expect(fixture.openDatabase).toHaveBeenCalledOnce();
    expect(fixture.createChildRepository).toHaveBeenCalledOnce();
    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
  });

  it('delegates child creation to the existing application behavior', async () => {
    const fixture = createRuntimeFixture();

    const child = await fixture.runtime.children.createChild(
      { displayName: '  Kim  ', dateOfBirth: '2025-01-10' },
    );

    expect(child).toEqual({
      id: 'generated-child-id',
      displayName: 'Kim',
      dateOfBirth: '2025-01-10',
    });
    expect(fixture.childRepository.save).toHaveBeenCalledWith(child);
    expect(fixture.activeChildRepository.activeChildId).toBe(child.id);
  });

  it('delegates child retrieval to the repository through the use case', async () => {
    const fixture = createRuntimeFixture();
    const child: Child = {
      id: 'existing-child',
      displayName: 'Kim',
      dateOfBirth: createCalendarDate('2025-01-10'),
    };
    fixture.childRepository.children.set(child.id, child);

    await expect(fixture.runtime.children.getChildById(child.id)).resolves.toBe(child);
    expect(fixture.childRepository.getById).toHaveBeenCalledWith(child.id);
  });

  it('exposes the deterministic child list through the application runtime', async () => {
    const fixture = createRuntimeFixture();
    const youngerChild: Child = {
      id: 'child-younger',
      displayName: 'Mio',
      dateOfBirth: createCalendarDate('2025-01-10'),
    };
    const olderChild: Child = {
      id: 'child-older',
      displayName: 'Mira',
      dateOfBirth: createCalendarDate('2023-05-10'),
    };
    fixture.childRepository.children.set(youngerChild.id, youngerChild);
    fixture.childRepository.children.set(olderChild.id, olderChild);

    await expect(fixture.runtime.children.listChildren()).resolves.toEqual([
      youngerChild,
      olderChild,
    ]);
    expect(fixture.childRepository.listChildren).toHaveBeenCalledOnce();
  });

  it('sanitizes child-list infrastructure failures', async () => {
    const fixture = createRuntimeFixture();
    fixture.childRepository.listChildren.mockRejectedValueOnce(
      new Error('raw SQLite child-list failure'),
    );

    const error = await fixture.runtime.children
      .listChildren()
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('child-list failure');
  });

  it('sanitizes initialization failures', async () => {
    const fixture = createRuntimeFixture({
      openDatabase: async () => {
        throw new Error('native SQLCipher failure containing sensitive details');
      },
    });

    const error = await fixture.runtime.children
      .getChildById('child')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AppRuntimeError);
    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('sensitive details');
  });

  it('allows a later explicit operation to retry failed initialization', async () => {
    const database = new FakeDatabase();
    const openDatabase = vi
      .fn<() => Promise<FakeDatabase>>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(database);
    const childRepository = new FakeChildRepository();
    const runtime = createAppRuntime({
      openDatabase,
      createActiveChildRepository: () => new FakeActiveChildRepository(),
      createChildRepository: () => childRepository,
      createFeedingRepository: () => new FakeFeedingRepository(),
      createBreastfeedingTimerRepository: () =>
        new FakeBreastfeedingTimerRepository(),
      createSleepRepository: () => new FakeSleepRepository(),
      createDiaperRepository: () => new FakeDiaperRepository(),
      childIdGenerator: { generate: () => 'generated-child-id' },
      feedingIdGenerator: { generate: () => 'generated-feeding-id' },
      sleepIdGenerator: { generate: () => 'generated-sleep-id' },
      diaperIdGenerator: { generate: () => 'generated-diaper-id' },
      getCurrentCalendarDate: () => asOf,
      getCurrentEpochMs: () => 1_765_000_000_123,
    });

    await expect(runtime.children.getChildById('child')).rejects.toMatchObject({
      code: 'local-data-unavailable',
    });
    await expect(runtime.children.getChildById('child')).resolves.toBeNull();
    expect(openDatabase).toHaveBeenCalledTimes(2);
  });

  it('closes the connection when repository construction fails', async () => {
    const database = new FakeDatabase();
    const runtime = createAppRuntime({
      openDatabase: async () => database,
      createActiveChildRepository: () => new FakeActiveChildRepository(),
      createChildRepository: () => {
        throw new Error('repository construction exposed native details');
      },
      createFeedingRepository: () => new FakeFeedingRepository(),
      createBreastfeedingTimerRepository: () =>
        new FakeBreastfeedingTimerRepository(),
      createSleepRepository: () => new FakeSleepRepository(),
      createDiaperRepository: () => new FakeDiaperRepository(),
      childIdGenerator: { generate: () => 'generated-child-id' },
      feedingIdGenerator: { generate: () => 'generated-feeding-id' },
      sleepIdGenerator: { generate: () => 'generated-sleep-id' },
      diaperIdGenerator: { generate: () => 'generated-diaper-id' },
      getCurrentCalendarDate: () => asOf,
      getCurrentEpochMs: () => 1_765_000_000_123,
    });

    const error = await runtime.children
      .getChildById('child')
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('native details');
    expect(database.closeAsync).toHaveBeenCalledOnce();
  });

  it('preserves domain and application validation errors', async () => {
    const fixture = createRuntimeFixture();

    const error = await fixture.runtime.children
      .createChild({ displayName: '   ', dateOfBirth: '2025-01-10' })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ChildValidationError);
    expect(error).toMatchObject({ code: 'invalid-display-name' });
    expect(error).not.toBeInstanceOf(AppRuntimeError);
    expect(fixture.childRepository.save).not.toHaveBeenCalled();
  });

  it('preserves malformed and future date validation codes', async () => {
    const fixture = createRuntimeFixture();

    const malformed = await fixture.runtime.children
      .createChild({ displayName: 'Kim', dateOfBirth: 'not-a-date' })
      .catch((reason: unknown) => reason);
    const future = await fixture.runtime.children
      .createChild({ displayName: 'Kim', dateOfBirth: '2025-06-16' })
      .catch((reason: unknown) => reason);

    expect(malformed).toBeInstanceOf(CalendarDateValidationError);
    expect(malformed).toMatchObject({ code: 'invalid-calendar-date' });
    expect(future).toBeInstanceOf(ChildValidationError);
    expect(future).toMatchObject({ code: 'future-date-of-birth' });
  });

  it('supplies the current local calendar date to child creation', async () => {
    const getCurrentCalendarDate = vi.fn(() => createCalendarDate('2025-01-10'));
    const fixture = createRuntimeFixture({ getCurrentCalendarDate });

    await expect(
      fixture.runtime.children.createChild({
        displayName: 'Kim',
        dateOfBirth: '2025-01-10',
      }),
    ).resolves.toMatchObject({ dateOfBirth: '2025-01-10' });
    expect(getCurrentCalendarDate).toHaveBeenCalledOnce();
  });

  it('sanitizes current local calendar date infrastructure failures', async () => {
    const fixture = createRuntimeFixture({
      getCurrentCalendarDate: () => {
        throw new Error('raw system date failure');
      },
    });

    const error = await fixture.runtime.children
      .createChild({ displayName: 'Kim', dateOfBirth: '2025-01-10' })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AppRuntimeError);
    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('system date');
  });

  it('sanitizes child ID generator infrastructure failures', async () => {
    const database = new FakeDatabase();
    const runtime = createAppRuntime({
      openDatabase: async () => database,
      createActiveChildRepository: () => new FakeActiveChildRepository(),
      createChildRepository: () => new FakeChildRepository(),
      createFeedingRepository: () => new FakeFeedingRepository(),
      createBreastfeedingTimerRepository: () =>
        new FakeBreastfeedingTimerRepository(),
      createSleepRepository: () => new FakeSleepRepository(),
      createDiaperRepository: () => new FakeDiaperRepository(),
      childIdGenerator: {
        generate: () => {
          throw new Error('raw native UUID failure');
        },
      },
      feedingIdGenerator: { generate: () => 'generated-feeding-id' },
      sleepIdGenerator: { generate: () => 'generated-sleep-id' },
      diaperIdGenerator: { generate: () => 'generated-diaper-id' },
      getCurrentCalendarDate: () => asOf,
      getCurrentEpochMs: () => 1_765_000_000_123,
    });

    const error = await runtime.children
      .createChild({ displayName: 'Kim', dateOfBirth: '2025-01-10' })
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('native UUID');
  });

  it('does not expose repository infrastructure errors', async () => {
    const fixture = createRuntimeFixture();
    fixture.childRepository.getById.mockRejectedValueOnce(
      new Error('raw SQLite error containing a database path'),
    );

    const error = await fixture.runtime.children
      .getChildById('child')
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('database path');
  });

  it('gets and explicitly sets the active child through application behavior', async () => {
    const fixture = createRuntimeFixture();
    const child: Child = {
      id: 'existing-child',
      displayName: 'Kim',
      dateOfBirth: createCalendarDate('2025-01-10'),
    };
    fixture.childRepository.children.set(child.id, child);

    await expect(fixture.runtime.children.getActiveChild()).resolves.toBeNull();
    await expect(
      fixture.runtime.children.setActiveChild(child.id),
    ).resolves.toBe(child);
    await expect(fixture.runtime.children.getActiveChild()).resolves.toBe(child);
  });

  it('exposes the application bootstrap decision', async () => {
    const fixture = createRuntimeFixture();

    await expect(fixture.runtime.children.getBootstrapStatus()).resolves.toEqual({
      status: 'onboarding-required',
    });

    const child: Child = {
      id: 'existing-child',
      displayName: 'Kim',
      dateOfBirth: createCalendarDate('2025-01-10'),
    };
    fixture.childRepository.children.set(child.id, child);

    await expect(fixture.runtime.children.getBootstrapStatus()).resolves.toEqual({
      status: 'active-selection-required',
    });

    fixture.activeChildRepository.activeChildId = child.id;
    await expect(fixture.runtime.children.getBootstrapStatus()).resolves.toEqual({
      status: 'ready',
    });
  });

  it('sanitizes bootstrap existence-query failures', async () => {
    const fixture = createRuntimeFixture();
    fixture.childRepository.hasChildren.mockRejectedValueOnce(
      new Error('raw SQLite existence failure'),
    );

    const error = await fixture.runtime.children
      .getBootstrapStatus()
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AppRuntimeError);
    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('existence failure');
  });

  it('preserves child-not-found as an application error', async () => {
    const fixture = createRuntimeFixture();

    const error = await fixture.runtime.children
      .setActiveChild('missing-child')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ActiveChildError);
    expect(error).toMatchObject({ code: 'child-not-found' });
    expect(error).not.toBeInstanceOf(AppRuntimeError);
  });

  it('sanitizes active-child persistence failures', async () => {
    const fixture = createRuntimeFixture();
    fixture.activeChildRepository.getActiveChildId.mockRejectedValueOnce(
      new Error('raw SQLite active-child error'),
    );

    const error = await fixture.runtime.children
      .getActiveChild()
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('active-child error');
  });

  it('tracks an active-child operation during shutdown', async () => {
    const fixture = createRuntimeFixture();
    const operationStarted = createDeferred<void>();
    const activeChildResult = createDeferred<string | null>();
    fixture.activeChildRepository.getActiveChildId.mockImplementationOnce(
      async () => {
        operationStarted.resolve();
        return activeChildResult.promise;
      },
    );

    const operation = fixture.runtime.children.getActiveChild();
    await operationStarted.promise;

    const closePromise = fixture.runtime.close();
    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
    await expect(
      fixture.runtime.children.setActiveChild('new-operation'),
    ).rejects.toMatchObject({ code: 'runtime-closed' });

    activeChildResult.resolve(null);
    await expect(operation).resolves.toBeNull();
    await closePromise;
    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });

  it('tracks a pending bootstrap operation during shutdown', async () => {
    const fixture = createRuntimeFixture();
    const existenceResult = createDeferred<boolean>();
    fixture.childRepository.hasChildren.mockImplementationOnce(
      () => existenceResult.promise,
    );

    const operation = fixture.runtime.children.getBootstrapStatus();
    await vi.waitFor(() => {
      expect(fixture.childRepository.hasChildren).toHaveBeenCalledOnce();
    });

    const closePromise = fixture.runtime.close();
    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
    await expect(
      fixture.runtime.children.getBootstrapStatus(),
    ).rejects.toMatchObject({ code: 'runtime-closed' });

    existenceResult.resolve(false);
    await expect(operation).resolves.toEqual({ status: 'onboarding-required' });
    await closePromise;
    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });

  it('tracks child creation during shutdown', async () => {
    const fixture = createRuntimeFixture();
    const saveStarted = createDeferred<void>();
    const saveResult = createDeferred<void>();
    fixture.childRepository.save.mockImplementationOnce(async (child) => {
      saveStarted.resolve();
      await saveResult.promise;
      fixture.childRepository.children.set(child.id, child);
    });

    const operation = fixture.runtime.children.createChild({
      displayName: 'Kim',
      dateOfBirth: '2025-01-10',
    });
    await saveStarted.promise;

    const closePromise = fixture.runtime.close();
    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
    await expect(
      fixture.runtime.children.createChild({
        displayName: 'New work',
        dateOfBirth: '2025-01-10',
      }),
    ).rejects.toMatchObject({ code: 'runtime-closed' });

    saveResult.resolve();
    await expect(operation).resolves.toMatchObject({ id: 'generated-child-id' });
    await closePromise;
    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });

  it('keeps the database open after successful operations', async () => {
    const fixture = createRuntimeFixture();

    await fixture.runtime.children.getChildById('child');

    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
  });

  it('closes the initialized database exactly once', async () => {
    const fixture = createRuntimeFixture();
    await fixture.runtime.children.getChildById('child');

    await fixture.runtime.close();

    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });

  it('makes repeated close calls safe', async () => {
    const fixture = createRuntimeFixture();
    await fixture.runtime.children.getChildById('child');

    await Promise.all([
      fixture.runtime.close(),
      fixture.runtime.close(),
      fixture.runtime.close(),
    ]);

    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });

  it('waits for an active repository operation before closing', async () => {
    const fixture = createRuntimeFixture();
    const operationStarted = createDeferred<void>();
    const repositoryResult = createDeferred<Child | null>();
    fixture.childRepository.getById.mockImplementationOnce(async () => {
      operationStarted.resolve();
      return repositoryResult.promise;
    });

    const operation = fixture.runtime.children.getChildById('child');
    await operationStarted.promise;

    const closePromise = fixture.runtime.close();
    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
    await expect(fixture.runtime.children.getChildById('new-operation')).rejects.toMatchObject({
      code: 'runtime-closed',
    });
    expect(fixture.openDatabase).toHaveBeenCalledOnce();

    repositoryResult.resolve(null);
    await expect(operation).resolves.toBeNull();
    await closePromise;

    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });

  it('closes a connection that resolves after close begins', async () => {
    const deferredDatabase = createDeferred<FakeDatabase>();
    const fixture = createRuntimeFixture({
      openDatabase: () => deferredDatabase.promise,
    });
    const operation = fixture.runtime.children.getChildById('child');
    const operationResult = operation.catch((reason: unknown) => reason);

    const closePromise = fixture.runtime.close();
    deferredDatabase.resolve(fixture.database);

    const error = await operationResult;
    await closePromise;
    expect(error).toMatchObject({ code: 'runtime-closed' });
    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
    expect(fixture.createChildRepository).not.toHaveBeenCalled();
  });

  it('rejects operations after close without reopening', async () => {
    const fixture = createRuntimeFixture();

    await fixture.runtime.close();

    await expect(fixture.runtime.children.getChildById('child')).rejects.toMatchObject({
      code: 'runtime-closed',
    });
    expect(fixture.openDatabase).not.toHaveBeenCalled();
  });
});

describe('active child summary runtime boundary', () => {
  it('uses the injected date on every read and returns the saved display name', async () => {
    let reference = createCalendarDate('2025-02-28');
    const clock = vi.fn(() => reference);
    const fixture = createRuntimeFixture({ getCurrentCalendarDate: clock });
    const child = await fixture.runtime.children.createChild({
      displayName: 'Mio',
      dateOfBirth: '2024-02-29',
    });
    clock.mockClear();
    await expect(fixture.runtime.children.getActiveChildSummary()).resolves.toEqual({
      child, age: { years: 1, months: 0, days: 0, fullDays: 365, fullWeeks: 52, remainingWeekDays: 1 },
    });
    reference = createCalendarDate('2025-03-29');
    await expect(fixture.runtime.children.getActiveChildSummary()).resolves.toMatchObject({
      age: { years: 1, months: 1, days: 1 },
    });
    expect(clock).toHaveBeenCalledTimes(2);
    expect(fixture.openDatabase).toHaveBeenCalledOnce();
  });

  it('returns null without turning missing selection into onboarding', async () => {
    const fixture = createRuntimeFixture();
    await expect(fixture.runtime.children.getActiveChildSummary()).resolves.toBeNull();
    expect(fixture.childRepository.hasChildren).not.toHaveBeenCalled();
  });

  it('sanitizes repository failures', async () => {
    const fixture = createRuntimeFixture();
    fixture.activeChildRepository.getActiveChildId.mockRejectedValueOnce(
      new Error('secret SQL/path/key'),
    );
    await expect(fixture.runtime.children.getActiveChildSummary())
      .rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
  });

  it('sanitizes clock failures', async () => {
    const fixture = createRuntimeFixture({
      getCurrentCalendarDate: () => { throw new Error('private clock details'); },
    });
    await expect(fixture.runtime.children.getActiveChildSummary())
      .rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
  });

  it('safely rejects a clock rollback before birth', async () => {
    let reference = asOf;
    const fixture = createRuntimeFixture({ getCurrentCalendarDate: () => reference });
    await fixture.runtime.children.createChild({
      displayName: 'Mio',
      dateOfBirth: '2025-06-15',
    });
    reference = createCalendarDate('2025-06-14');
    await expect(fixture.runtime.children.getActiveChildSummary())
      .rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
  });

  it('waits for a summary read before closing and rejects further reads', async () => {
    const fixture = createRuntimeFixture();
    const deferred = createDeferred<string | null>();
    fixture.activeChildRepository.getActiveChildId.mockImplementationOnce(() => deferred.promise);
    const operation = fixture.runtime.children.getActiveChildSummary();
    await vi.waitFor(() => expect(fixture.activeChildRepository.getActiveChildId).toHaveBeenCalled());
    const closing = fixture.runtime.close();
    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
    await expect(fixture.runtime.children.getActiveChildSummary())
      .rejects.toEqual(new AppRuntimeError('runtime-closed'));
    deferred.resolve(null);
    await expect(operation).resolves.toBeNull();
    await closing;
    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });
});

describe('feeding runtime boundary', () => {
  async function createActiveChildFixture(options?: Parameters<typeof createRuntimeFixture>[0]) {
    const fixture = createRuntimeFixture(options);
    const child: Child = {
      id: 'active-child',
      displayName: 'Mio',
      dateOfBirth: createCalendarDate('2025-01-10'),
    };
    fixture.childRepository.children.set(child.id, child);
    fixture.activeChildRepository.activeChildId = child.id;
    return { ...fixture, child };
  }

  it('records for the resolved active child with injected ID and epoch clock', async () => {
    const clock = vi.fn(() => 1_765_123_456_789);
    const fixture = await createActiveChildFixture({ getCurrentEpochMs: clock });

    const event = await fixture.runtime.feeding.recordFeeding({
      kind: 'bottle',
      amountMl: 72.5,
      contents: 'expressed-breast-milk',
    });

    expect(event).toEqual({
      id: 'generated-feeding-id',
      childId: fixture.child.id,
      occurredAtEpochMs: 1_765_123_456_789,
      kind: 'bottle',
      amountMl: 72.5,
      contents: 'expressed-breast-milk',
    });
    expect(fixture.feedingRepository.save).toHaveBeenCalledWith(event);
    expect(clock).toHaveBeenCalledOnce();
  });

  it('lists recent history for the currently resolved active child', async () => {
    const fixture = await createActiveChildFixture();
    const event: FeedingEvent = {
      id: 'feeding-1', childId: fixture.child.id, occurredAtEpochMs: 123,
      kind: 'bottle', amountMl: 62.5, contents: 'mixed',
    };
    fixture.feedingRepository.recentEvents.push(event, {
      id: 'other', childId: 'other-child', occurredAtEpochMs: 999,
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    });

    await expect(fixture.runtime.feeding.getRecentFeedings()).resolves.toEqual({
      childId: fixture.child.id,
      events: [event],
    });
    expect(fixture.feedingRepository.listRecentByChildId)
      .toHaveBeenCalledWith(fixture.child.id, 20);
  });

  it('refuses history when there is no usable active child', async () => {
    const fixture = createRuntimeFixture();

    await expect(fixture.runtime.feeding.getRecentFeedings()).rejects.toMatchObject({
      code: 'active-child-required',
    });
    expect(fixture.feedingRepository.listRecentByChildId).not.toHaveBeenCalled();
  });

  it('sanitizes recent-history persistence and mapping failures', async () => {
    const fixture = await createActiveChildFixture();
    fixture.feedingRepository.listRecentByChildId.mockRejectedValueOnce(
      new Error('raw SQLCipher row details'),
    );

    const error = await fixture.runtime.feeding.getRecentFeedings()
      .catch((reason: unknown) => reason);

    expect(error).toEqual(new AppRuntimeError('local-data-unavailable'));
    expect(String(error)).not.toContain('SQLCipher');
  });

  it('holds history SELECT behind an active ordinary feeding write', async () => {
    const fixture = await createActiveChildFixture();
    const write = createDeferred<void>();
    fixture.feedingRepository.save.mockImplementationOnce(() => write.promise);

    const saving = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 60, contents: 'formula',
    });
    await vi.waitFor(() => expect(fixture.feedingRepository.save).toHaveBeenCalledOnce());
    const reading = fixture.runtime.feeding.getRecentFeedings();
    await Promise.resolve();
    expect(fixture.feedingRepository.listRecentByChildId).not.toHaveBeenCalled();

    write.resolve();
    await saving;
    await reading;
    expect(fixture.feedingRepository.listRecentByChildId).toHaveBeenCalledOnce();
  });

  it('releases feeding serialization after a failed ordinary write', async () => {
    const fixture = await createActiveChildFixture();
    fixture.feedingRepository.save.mockRejectedValueOnce(
      new Error('injected write failure'),
    );

    await expect(fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 60, contents: 'formula',
    })).rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
    await expect(fixture.runtime.feeding.getRecentFeedings()).resolves.toEqual({
      childId: fixture.child.id,
      events: [],
    });
    expect(fixture.feedingRepository.listRecentByChildId).toHaveBeenCalledOnce();
  });

  it('refuses a missing or stale active child without persisting', async () => {
    const missing = createRuntimeFixture();
    await expect(missing.runtime.feeding.recordFeeding({
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    })).rejects.toMatchObject({ code: 'active-child-required' });

    const stale = createRuntimeFixture();
    stale.activeChildRepository.activeChildId = 'deleted-child';
    await expect(stale.runtime.feeding.recordFeeding({
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    })).rejects.toMatchObject({ code: 'active-child-required' });
    expect(stale.activeChildRepository.clearActiveChildIdIfMatches)
      .toHaveBeenCalledWith('deleted-child');
    expect(missing.feedingRepository.save).not.toHaveBeenCalled();
    expect(stale.feedingRepository.save).not.toHaveBeenCalled();
  });

  it('sanitizes repository, ID-generator, and clock failures', async () => {
    const repositoryFailure = await createActiveChildFixture();
    repositoryFailure.feedingRepository.save.mockRejectedValueOnce(
      new Error('raw SQLite database path'),
    );
    const repositoryError = await repositoryFailure.runtime.feeding
      .recordFeeding({ kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0 })
      .catch((reason: unknown) => reason);

    const idFailure = await createActiveChildFixture({
      feedingIdGenerator: { generate: () => { throw new Error('raw native UUID'); } },
    });
    const idError = await idFailure.runtime.feeding
      .recordFeeding({ kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0 })
      .catch((reason: unknown) => reason);

    const clockFailure = await createActiveChildFixture({
      getCurrentEpochMs: () => { throw new Error('raw native clock'); },
    });
    const clockError = await clockFailure.runtime.feeding
      .recordFeeding({ kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0 })
      .catch((reason: unknown) => reason);

    const invalidClock = await createActiveChildFixture({
      getCurrentEpochMs: () => 10.5,
    });
    const invalidClockError = await invalidClock.runtime.feeding
      .recordFeeding({ kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0 })
      .catch((reason: unknown) => reason);

    for (const error of [repositoryError, idError, clockError, invalidClockError]) {
      expect(error).toEqual(new AppRuntimeError('local-data-unavailable'));
      expect(String(error)).not.toMatch(/SQLite|UUID|clock/);
    }
  });

  it('sanitizes an invalid generated feeding ID', async () => {
    const fixture = await createActiveChildFixture({
      feedingIdGenerator: { generate: () => '   ' },
    });

    await expect(fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 60, contents: 'formula',
    })).rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();
  });

  it('preserves domain validation errors', async () => {
    const fixture = await createActiveChildFixture();

    const error = await fixture.runtime.feeding.recordFeeding({
      kind: 'breast', leftDurationSeconds: 0, rightDurationSeconds: 0,
    }).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'invalid-duration' });
    expect(error).not.toBeInstanceOf(AppRuntimeError);
  });

  it('waits for an active feeding write before closing', async () => {
    const fixture = await createActiveChildFixture();
    const write = createDeferred<void>();
    fixture.feedingRepository.save.mockImplementationOnce(() => write.promise);

    const operation = fixture.runtime.feeding.recordFeeding({
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    });
    await vi.waitFor(() => expect(fixture.feedingRepository.save).toHaveBeenCalledOnce());
    const closing = fixture.runtime.close();
    expect(fixture.database.closeAsync).not.toHaveBeenCalled();
    await expect(fixture.runtime.feeding.recordFeeding({
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    })).rejects.toEqual(new AppRuntimeError('runtime-closed'));
    write.resolve();
    await operation;
    await closing;
    expect(fixture.database.closeAsync).toHaveBeenCalledOnce();
  });

  it('owns timer child, ID, clock, and frozen completion timestamp', async () => {
    let epoch = 1_000_000;
    let id = 0;
    const fixture = await createActiveChildFixture({
      getCurrentEpochMs: () => epoch,
      feedingIdGenerator: { generate: () => `feeding-${++id}` },
    });

    await fixture.runtime.feeding.startBreastfeedingTimer('left');
    epoch = 1_062_500;
    const finished = await fixture.runtime.feeding.finishBreastfeedingTimer();
    epoch = 9_000_000;
    const event = await fixture.runtime.feeding.saveFinishedBreastfeedingTimer();

    expect(finished).toMatchObject({
      status: 'ready',
      session: { status: 'finished', childId: fixture.child.id },
    });
    expect(event).toMatchObject({
      id: 'feeding-2',
      childId: fixture.child.id,
      occurredAtEpochMs: 1_062_500,
      leftDurationSeconds: 62,
      rightDurationSeconds: 0,
    });
    expect(fixture.breastfeedingTimerRepository.completedEvents).toEqual([event]);
  });

  it('restores persisted state and safely pauses a backward clock with one read', async () => {
    let epoch = 1_000_000;
    const clock = vi.fn(() => epoch);
    const fixture = await createActiveChildFixture({ getCurrentEpochMs: clock });
    await fixture.runtime.feeding.startBreastfeedingTimer('right');
    clock.mockClear();
    epoch = 999_000;

    const state = await fixture.runtime.feeding.getBreastfeedingTimer();

    expect(clock).toHaveBeenCalledOnce();
    expect(state).toMatchObject({
      status: 'ready',
      clockMovedBackward: true,
      session: {
        status: 'paused',
        childId: fixture.child.id,
        resumeSide: 'right',
        accumulatedLeftMs: 0,
        accumulatedRightMs: 0,
      },
    });
  });

  it('does not move a persisted timer to a different active child', async () => {
    const fixture = await createActiveChildFixture();
    await fixture.runtime.feeding.startBreastfeedingTimer('left');
    const other: Child = {
      id: 'other-child', displayName: 'Mira',
      dateOfBirth: createCalendarDate('2025-02-10'),
    };
    fixture.childRepository.children.set(other.id, other);
    fixture.activeChildRepository.activeChildId = other.id;

    await expect(fixture.runtime.feeding.getBreastfeedingTimer()).resolves
      .toMatchObject({ status: 'active-child-mismatch' });
    await expect(fixture.runtime.feeding.pauseBreastfeedingTimer()).rejects
      .toMatchObject({ code: 'active-child-mismatch' });
    expect(fixture.breastfeedingTimerRepository.session?.childId)
      .toBe(fixture.child.id);
  });

  it('synchronously rejects a duplicate timer transition while one is pending', async () => {
    const fixture = await createActiveChildFixture();
    const pending = createDeferred<BreastfeedingTimerSession | null>();
    fixture.breastfeedingTimerRepository.get.mockImplementationOnce(
      () => pending.promise,
    );

    const first = fixture.runtime.feeding.startBreastfeedingTimer('left');
    await vi.waitFor(() => {
      expect(fixture.breastfeedingTimerRepository.get).toHaveBeenCalledOnce();
    });
    await expect(fixture.runtime.feeding.startBreastfeedingTimer('right'))
      .rejects.toMatchObject({ code: 'timer-busy' });
    pending.resolve(null);
    await expect(first).resolves.toMatchObject({ status: 'ready' });
    expect(fixture.breastfeedingTimerRepository.create).toHaveBeenCalledOnce();
  });

  it('sanitizes timer persistence and clock failures', async () => {
    const repositoryFailure = await createActiveChildFixture();
    repositoryFailure.breastfeedingTimerRepository.get.mockRejectedValueOnce(
      new Error('raw SQLCipher timer path'),
    );
    const repositoryError = repositoryFailure.runtime.feeding
      .getBreastfeedingTimer().catch((reason: unknown) => reason);

    const clockFailure = await createActiveChildFixture({
      getCurrentEpochMs: () => Number.NaN,
    });
    const clockError = clockFailure.runtime.feeding
      .startBreastfeedingTimer('left').catch((reason: unknown) => reason);

    for (const error of await Promise.all([repositoryError, clockError])) {
      expect(error).toEqual(new AppRuntimeError('local-data-unavailable'));
      expect(String(error)).not.toMatch(/SQLCipher|timer path/);
    }
  });

  it('holds ordinary feeding SQL behind an in-progress timer completion', async () => {
    let id = 0;
    const clock = vi.fn(() => 1_765_000_000_123);
    const fixture = await createActiveChildFixture({
      feedingIdGenerator: { generate: () => `feeding-${++id}` },
      getCurrentEpochMs: clock,
    });
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer-session', childId: fixture.child.id, status: 'finished',
      accumulatedLeftMs: 60_000, accumulatedRightMs: 0,
      finishedAtEpochMs: 1_765_000_000_000,
    };
    const timerTransactionStarted = createDeferred<void>();
    const finishTimerTransaction = createDeferred<void>();
    const order: string[] = [];
    fixture.breastfeedingTimerRepository.complete.mockImplementationOnce(
      async (_sessionId, event) => {
        order.push('timer-BEGIN', 'timer-INSERT');
        timerTransactionStarted.resolve();
        await finishTimerTransaction.promise;
        order.push('timer-DELETE', 'timer-COMMIT');
        fixture.breastfeedingTimerRepository.completedEvents.push(event);
        fixture.breastfeedingTimerRepository.session = null;
      },
    );
    fixture.feedingRepository.save.mockImplementationOnce(async () => {
      order.push('ordinary-INSERT');
    });

    const timerSave = fixture.runtime.feeding.saveFinishedBreastfeedingTimer();
    await timerTransactionStarted.promise;
    const ordinarySave = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 60, contents: 'formula',
    });
    await Promise.resolve();
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();

    finishTimerTransaction.resolve();
    await timerSave;
    await ordinarySave;
    expect(order).toEqual([
      'timer-BEGIN', 'timer-INSERT', 'timer-DELETE', 'timer-COMMIT',
      'ordinary-INSERT',
    ]);
  });

  it('holds history SELECT behind an in-progress timer completion', async () => {
    const fixture = await createActiveChildFixture();
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer-session', childId: fixture.child.id, status: 'finished',
      accumulatedLeftMs: 60_000, accumulatedRightMs: 0,
      finishedAtEpochMs: 1_765_000_000_000,
    };
    const completionStarted = createDeferred<void>();
    const finishCompletion = createDeferred<void>();
    fixture.breastfeedingTimerRepository.complete.mockImplementationOnce(
      async (_sessionId, event) => {
        completionStarted.resolve();
        await finishCompletion.promise;
        fixture.breastfeedingTimerRepository.completedEvents.push(event);
        fixture.breastfeedingTimerRepository.session = null;
      },
    );

    const saving = fixture.runtime.feeding.saveFinishedBreastfeedingTimer();
    await completionStarted.promise;
    const reading = fixture.runtime.feeding.getRecentFeedings();
    await Promise.resolve();
    expect(fixture.feedingRepository.listRecentByChildId).not.toHaveBeenCalled();

    finishCompletion.resolve();
    await saving;
    await reading;
    expect(fixture.feedingRepository.listRecentByChildId).toHaveBeenCalledOnce();
  });

  it('releases feeding serialization after a failed history read', async () => {
    const fixture = await createActiveChildFixture();
    fixture.feedingRepository.listRecentByChildId.mockRejectedValueOnce(
      new Error('injected read failure'),
    );

    await expect(fixture.runtime.feeding.getRecentFeedings()).rejects.toEqual(
      new AppRuntimeError('local-data-unavailable'),
    );
    await expect(fixture.runtime.feeding.recordFeeding({
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    })).resolves.toMatchObject({ kind: 'breast' });
    expect(fixture.feedingRepository.save).toHaveBeenCalledOnce();
  });

  it('does not begin timer completion while an ordinary feeding write owns serialization', async () => {
    let id = 0;
    const fixture = await createActiveChildFixture({
      feedingIdGenerator: { generate: () => `feeding-${++id}` },
    });
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer-session', childId: fixture.child.id, status: 'finished',
      accumulatedLeftMs: 60_000, accumulatedRightMs: 0,
      finishedAtEpochMs: 1_765_000_000_000,
    };
    const ordinaryWriteStarted = createDeferred<void>();
    const finishOrdinaryWrite = createDeferred<void>();
    const order: string[] = [];
    fixture.feedingRepository.save.mockImplementationOnce(async () => {
      order.push('ordinary-INSERT-start');
      ordinaryWriteStarted.resolve();
      await finishOrdinaryWrite.promise;
      order.push('ordinary-INSERT-end');
    });
    fixture.breastfeedingTimerRepository.complete.mockImplementationOnce(
      async (_sessionId, event) => {
        order.push('timer-BEGIN');
        fixture.breastfeedingTimerRepository.completedEvents.push(event);
        fixture.breastfeedingTimerRepository.session = null;
      },
    );

    const ordinarySave = fixture.runtime.feeding.recordFeeding({
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    });
    await ordinaryWriteStarted.promise;
    const timerSave = fixture.runtime.feeding.saveFinishedBreastfeedingTimer();
    await Promise.resolve();
    expect(fixture.breastfeedingTimerRepository.complete).not.toHaveBeenCalled();

    finishOrdinaryWrite.resolve();
    await ordinarySave;
    await timerSave;
    expect(order).toEqual([
      'ordinary-INSERT-start', 'ordinary-INSERT-end', 'timer-BEGIN',
    ]);
  });

  it('releases feeding-write serialization when timer completion fails', async () => {
    const clock = vi.fn(() => 1_765_000_000_123);
    const fixture = await createActiveChildFixture({ getCurrentEpochMs: clock });
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer-session', childId: fixture.child.id, status: 'finished',
      accumulatedLeftMs: 60_000, accumulatedRightMs: 0,
      finishedAtEpochMs: 1_765_000_000_000,
    };
    const completionStarted = createDeferred<void>();
    const failCompletion = createDeferred<void>();
    fixture.breastfeedingTimerRepository.complete.mockImplementationOnce(
      async () => {
        completionStarted.resolve();
        await failCompletion.promise;
        throw new Error('injected transaction failure');
      },
    );

    const timerSave = fixture.runtime.feeding.saveFinishedBreastfeedingTimer();
    await completionStarted.promise;
    const ordinarySave = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 60, contents: 'formula',
    });
    await Promise.resolve();
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();

    failCompletion.resolve();
    await expect(timerSave).rejects.toEqual(
      new AppRuntimeError('local-data-unavailable'),
    );
    await expect(ordinarySave).resolves.toMatchObject({ kind: 'bottle' });
    expect(fixture.feedingRepository.save).toHaveBeenCalledOnce();
  });

  it('discards the active child timer without creating a feeding event', async () => {
    const fixture = await createActiveChildFixture();
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer-session', childId: fixture.child.id, status: 'paused',
      resumeSide: 'left', accumulatedLeftMs: 10_000, accumulatedRightMs: 0,
    };

    await expect(fixture.runtime.feeding.discardBreastfeedingTimer())
      .resolves.toEqual({ status: 'idle' });

    expect(fixture.breastfeedingTimerRepository.discard)
      .toHaveBeenCalledWith('timer-session');
    expect(fixture.breastfeedingTimerRepository.session).toBeNull();
    expect(fixture.breastfeedingTimerRepository.completedEvents).toEqual([]);
  });

  it('refuses discard when the active child does not own the timer', async () => {
    const fixture = await createActiveChildFixture();
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer-session', childId: 'other-child', status: 'running',
      activeSide: 'right', accumulatedLeftMs: 0, accumulatedRightMs: 0,
      segmentStartedAtEpochMs: 1_000_000,
    };

    await expect(fixture.runtime.feeding.discardBreastfeedingTimer())
      .rejects.toMatchObject({ code: 'active-child-mismatch' });
    expect(fixture.breastfeedingTimerRepository.discard).not.toHaveBeenCalled();
  });

  it('sanitizes discard persistence failures without clearing the session', async () => {
    const fixture = await createActiveChildFixture();
    const session: BreastfeedingTimerSession = {
      sessionId: 'timer-session', childId: fixture.child.id, status: 'paused',
      resumeSide: 'left', accumulatedLeftMs: 10_000, accumulatedRightMs: 0,
    };
    fixture.breastfeedingTimerRepository.session = session;
    fixture.breastfeedingTimerRepository.discard.mockRejectedValueOnce(
      new Error('raw SQLite discard path'),
    );

    const error = await fixture.runtime.feeding.discardBreastfeedingTimer()
      .catch((reason: unknown) => reason);

    expect(error).toEqual(new AppRuntimeError('local-data-unavailable'));
    expect(String(error)).not.toContain('SQLite');
    expect(fixture.breastfeedingTimerRepository.session).toBe(session);
  });

  it('serializes discard against an ordinary feeding write', async () => {
    const clock = vi.fn(() => 1_765_000_000_123);
    const fixture = await createActiveChildFixture({ getCurrentEpochMs: clock });
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer-session', childId: fixture.child.id, status: 'running',
      activeSide: 'left', accumulatedLeftMs: 0, accumulatedRightMs: 0,
      segmentStartedAtEpochMs: 1_000_000,
    };
    const discardStarted = createDeferred<void>();
    const finishDiscard = createDeferred<void>();
    fixture.breastfeedingTimerRepository.discard.mockImplementationOnce(
      async () => {
        discardStarted.resolve();
        await finishDiscard.promise;
        fixture.breastfeedingTimerRepository.session = null;
      },
    );

    const discard = fixture.runtime.feeding.discardBreastfeedingTimer();
    await discardStarted.promise;
    const ordinarySave = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 60, contents: 'formula',
    });
    await Promise.resolve();
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();

    finishDiscard.resolve();
    await discard;
    await ordinarySave;
    expect(fixture.feedingRepository.save).toHaveBeenCalledOnce();
  });
});

describe('sleep runtime boundary', () => {
  async function createActiveSleepFixture(
    getCurrentEpochMs: () => number = () => 1_000,
  ) {
    const fixture = createRuntimeFixture({ getCurrentEpochMs });
    const child: Child = {
      id: 'active-child', displayName: 'Mio',
      dateOfBirth: createCalendarDate('2025-01-10'),
    };
    fixture.childRepository.children.set(child.id, child);
    fixture.activeChildRepository.activeChildId = child.id;
    return { ...fixture, child };
  }

  it('resolves the active child and restores its persisted session and history', async () => {
    const fixture = await createActiveSleepFixture();
    const started = await fixture.runtime.sleep.start();
    expect(started.active).toEqual({
      id: 'generated-sleep-id', childId: fixture.child.id, startedAtEpochMs: 1_000,
    });
    const restored = await fixture.runtime.sleep.getState();
    expect(restored.active).toEqual(started.active);
    expect(fixture.sleepRepository.listRecentByChildId)
      .toHaveBeenLastCalledWith(fixture.child.id, 20);
  });

  it('keeps sessions owned by their child across active-child changes', async () => {
    const fixture = await createActiveSleepFixture();
    const first = await fixture.runtime.sleep.start();
    const secondChild: Child = {
      id: 'child-2', displayName: 'Mira', dateOfBirth: createCalendarDate('2025-02-10'),
    };
    fixture.childRepository.children.set(secondChild.id, secondChild);
    fixture.activeChildRepository.activeChildId = secondChild.id;
    const secondState = await fixture.runtime.sleep.getState();
    expect(secondState.active).toBeNull();
    fixture.activeChildRepository.activeChildId = fixture.child.id;
    await expect(fixture.runtime.sleep.getState()).resolves.toMatchObject({ active: first.active });
  });

  it('completes with the session identity and never exposes it as active afterward', async () => {
    let now = 1_000;
    const fixture = await createActiveSleepFixture(() => now);
    await fixture.runtime.sleep.start();
    now = 2_000;
    const completed = await fixture.runtime.sleep.complete('generated-sleep-id');
    expect(completed.active).toBeNull();
    expect(completed.events).toEqual([{
      id: 'generated-sleep-id', childId: fixture.child.id,
      startedAtEpochMs: 1_000, endedAtEpochMs: 2_000,
    }]);
  });

  it('refuses a stale displayed session identity after active-child state changes', async () => {
    const fixture = await createActiveSleepFixture();
    fixture.sleepRepository.active.set(fixture.child.id, {
      id: 'canonical-session', childId: fixture.child.id, startedAtEpochMs: 1,
    });

    await expect(fixture.runtime.sleep.complete('stale-session'))
      .rejects.toMatchObject({ code: 'sleep-session-changed' });
    await expect(fixture.runtime.sleep.discard('stale-session'))
      .rejects.toMatchObject({ code: 'sleep-session-changed' });
    expect(fixture.sleepRepository.complete).not.toHaveBeenCalled();
    expect(fixture.sleepRepository.discard).not.toHaveBeenCalled();
  });

  it('holds Feeding writes behind an in-progress Sleep transaction and releases after failure', async () => {
    const fixture = await createActiveSleepFixture();
    fixture.sleepRepository.active.set(fixture.child.id, {
      id: 'sleep-1', childId: fixture.child.id, startedAtEpochMs: 1,
    });
    const started = createDeferred<void>();
    const finish = createDeferred<void>();
    fixture.sleepRepository.complete.mockImplementationOnce(async () => {
      started.resolve(); await finish.promise; throw new Error('transaction failed');
    });
    const completion = fixture.runtime.sleep.complete('sleep-1');
    await started.promise;
    const feeding = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 10, contents: 'formula',
    });
    await Promise.resolve();
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();
    finish.resolve();
    await expect(completion).rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
    await expect(feeding).resolves.toMatchObject({ kind: 'bottle' });
  });

  it('holds Sleep writes behind an in-progress Feeding timer transaction', async () => {
    const fixture = await createActiveSleepFixture();
    fixture.breastfeedingTimerRepository.session = {
      sessionId: 'timer', childId: fixture.child.id, status: 'finished',
      accumulatedLeftMs: 1_000, accumulatedRightMs: 0, finishedAtEpochMs: 900,
    };
    const started = createDeferred<void>();
    const finish = createDeferred<void>();
    fixture.breastfeedingTimerRepository.complete.mockImplementationOnce(async () => {
      started.resolve(); await finish.promise;
      fixture.breastfeedingTimerRepository.session = null;
    });
    const feeding = fixture.runtime.feeding.saveFinishedBreastfeedingTimer();
    await started.promise;
    const sleep = fixture.runtime.sleep.start();
    await Promise.resolve();
    expect(fixture.sleepRepository.createActive).not.toHaveBeenCalled();
    finish.resolve();
    await feeding;
    await sleep;
    expect(fixture.sleepRepository.createActive).toHaveBeenCalledOnce();
  });

  it('records manual completed sleep for the runtime-resolved active child and refreshes history', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const state = await fixture.runtime.sleep.recordCompleted({
      startedAtEpochMs: 100,
      endedAtEpochMs: 500,
    });
    expect(fixture.sleepRepository.saveCompleted).toHaveBeenCalledWith({
      id: 'generated-sleep-id', childId: fixture.child.id,
      startedAtEpochMs: 100, endedAtEpochMs: 500,
    });
    expect(state.childId).toBe(fixture.child.id);
    expect(state.events).toContainEqual({
      id: 'generated-sleep-id', childId: fixture.child.id,
      startedAtEpochMs: 100, endedAtEpochMs: 500,
    });
  });

  it('keeps an active session intact when a non-overlapping manual sleep is saved', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const active = {
      id: 'active', childId: fixture.child.id, startedAtEpochMs: 1_000,
    };
    fixture.sleepRepository.active.set(fixture.child.id, active);
    await fixture.runtime.sleep.recordCompleted({
      startedAtEpochMs: 100, endedAtEpochMs: 1_000,
    });
    expect(fixture.sleepRepository.active.get(fixture.child.id)).toEqual(active);
  });

  it('serializes manual sleep once against Feeding and releases the queue after failure', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const started = createDeferred<void>();
    const finish = createDeferred<void>();
    fixture.sleepRepository.saveCompleted.mockImplementationOnce(async () => {
      started.resolve();
      await finish.promise;
      throw new Error('write failed');
    });
    const manual = fixture.runtime.sleep.recordCompleted({
      startedAtEpochMs: 100, endedAtEpochMs: 500,
    });
    await started.promise;
    const feeding = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 10, contents: 'formula',
    });
    await Promise.resolve();
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();
    finish.resolve();
    await expect(manual).rejects.toMatchObject({ code: 'completed-sleep-not-saved' });
    await expect(feeding).resolves.toMatchObject({ kind: 'bottle' });
  });

  it('records Diaper now with one authoritative clock read and the runtime active child', async () => {
    const getCurrentEpochMs = vi.fn(() => 2_000);
    const fixture = await createActiveSleepFixture(getCurrentEpochMs);
    const result = await fixture.runtime.diapers.record({ timing: 'now', kind: 'mixed' });
    expect(fixture.diaperRepository.save).toHaveBeenCalledWith({
      id: 'generated-diaper-id', childId: fixture.child.id,
      occurredAtEpochMs: 2_000, kind: 'mixed',
    });
    expect(getCurrentEpochMs).toHaveBeenCalledOnce();
    expect(result.state.events).toContainEqual(expect.objectContaining({ childId: fixture.child.id }));
  });

  it('accepts historical Diaper time, rejects future time, and never accepts a child ID', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    await expect(fixture.runtime.diapers.record({
      timing: 'historical', kind: 'dirty', occurredAtEpochMs: 1_000,
    })).resolves.toMatchObject({
      recordedEvent: { childId: fixture.child.id },
      state: { childId: fixture.child.id },
    });
    await expect(fixture.runtime.diapers.record({
      timing: 'historical', kind: 'wet', occurredAtEpochMs: 2_001,
    })).rejects.toMatchObject({ code: 'future-diaper' });
    expect(fixture.diaperRepository.save).toHaveBeenCalledOnce();
  });

  it('returns the exact recorded DiaperEvent together with canonical recent history', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const result = await fixture.runtime.diapers.record({ timing: 'now', kind: 'dirty' });
    expect(result.recordedEvent).toEqual({
      id: 'generated-diaper-id', childId: fixture.child.id,
      occurredAtEpochMs: 2_000, kind: 'dirty',
    });
    expect(result.state.events).toEqual([result.recordedEvent]);
    expect(fixture.diaperRepository.listRecentByChildId)
      .toHaveBeenLastCalledWith(fixture.child.id, 20);
  });

  it('rejects stale-child Diaper corrections before repository mutation', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const stale = {
      id: 'event', childId: fixture.child.id, occurredAtEpochMs: 1_000, kind: 'wet' as const,
    };
    const nextChild: Child = {
      id: 'child-2', displayName: 'Mira', dateOfBirth: createCalendarDate('2025-02-10'),
    };
    fixture.childRepository.children.set(nextChild.id, nextChild);
    fixture.activeChildRepository.activeChildId = nextChild.id;
    await expect(fixture.runtime.diapers.delete(stale)).rejects.toMatchObject({
      code: 'diaper-event-changed',
    });
    await expect(fixture.runtime.diapers.update({
      expected: stale, kind: 'dirty', occurredAtEpochMs: 900,
    })).rejects.toMatchObject({ code: 'diaper-event-changed' });
    expect(fixture.diaperRepository.deleteIfMatches).not.toHaveBeenCalled();
    expect(fixture.diaperRepository.updateIfMatches).not.toHaveBeenCalled();
  });

  it('updates a Diaper in place and returns canonically refreshed ordering', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const older = {
      id: 'older', childId: fixture.child.id, occurredAtEpochMs: 500, kind: 'wet' as const,
    };
    const newer = {
      id: 'newer', childId: fixture.child.id, occurredAtEpochMs: 1_000, kind: 'dirty' as const,
    };
    fixture.diaperRepository.events.push(older, newer);
    const state = await fixture.runtime.diapers.update({
      expected: older, kind: 'mixed', occurredAtEpochMs: 1_500,
    });
    expect(fixture.diaperRepository.updateIfMatches).toHaveBeenCalledWith(older, {
      ...older, occurredAtEpochMs: 1_500, kind: 'mixed',
    });
    expect(state.events[0]).toEqual({ ...older, occurredAtEpochMs: 1_500, kind: 'mixed' });
  });

  it('serializes Diaper correction once and releases the shared queue after failure', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const original = {
      id: 'event', childId: fixture.child.id, occurredAtEpochMs: 1_000, kind: 'wet' as const,
    };
    fixture.diaperRepository.events.push(original);
    const started = createDeferred<void>();
    const finish = createDeferred<void>();
    fixture.diaperRepository.deleteIfMatches.mockImplementationOnce(async () => {
      started.resolve(); await finish.promise; throw new Error('ambiguous delete');
    });
    const deletion = fixture.runtime.diapers.delete(original);
    await started.promise;
    const feeding = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 10, contents: 'formula',
    });
    await Promise.resolve();
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();
    finish.resolve();
    await expect(deletion).rejects.toMatchObject({ code: 'diaper-delete-not-applied' });
    await expect(feeding).resolves.toMatchObject({ kind: 'bottle' });
    expect(fixture.diaperRepository.deleteIfMatches).toHaveBeenCalledOnce();
  });

  it('serializes Diaper once against Feeding and releases the shared queue after failure', async () => {
    const fixture = await createActiveSleepFixture(() => 2_000);
    const started = createDeferred<void>();
    const finish = createDeferred<void>();
    fixture.diaperRepository.save.mockImplementationOnce(async () => {
      started.resolve(); await finish.promise; throw new Error('write failed');
    });
    const diaper = fixture.runtime.diapers.record({ timing: 'now', kind: 'wet' });
    await started.promise;
    const feeding = fixture.runtime.feeding.recordFeeding({
      kind: 'bottle', amountMl: 10, contents: 'formula',
    });
    await Promise.resolve();
    expect(fixture.feedingRepository.save).not.toHaveBeenCalled();
    finish.resolve();
    await expect(diaper).rejects.toMatchObject({ code: 'diaper-not-saved' });
    await expect(feeding).resolves.toMatchObject({ kind: 'bottle' });
  });
});
