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
import type { FeedingEvent } from '../features/feeding/domain/feeding-event';

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
  readonly save = vi.fn(async (_event: FeedingEvent): Promise<void> => undefined);
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
  const openDatabase = vi.fn(options?.openDatabase ?? (async () => database));
  const createChildRepository = vi.fn(() => childRepository);
  const createActiveChildRepository = vi.fn(() => activeChildRepository);
  const runtime = createAppRuntime({
    openDatabase,
    createActiveChildRepository,
    createChildRepository,
    createFeedingRepository: () => feedingRepository,
    childIdGenerator: { generate: () => 'generated-child-id' },
    feedingIdGenerator:
      options?.feedingIdGenerator ?? { generate: () => 'generated-feeding-id' },
    getCurrentCalendarDate: options?.getCurrentCalendarDate ?? (() => asOf),
    getCurrentEpochMs:
      options?.getCurrentEpochMs ?? (() => 1_765_000_000_123),
  });

  return {
    database,
    activeChildRepository,
    childRepository,
    feedingRepository,
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
      childIdGenerator: { generate: () => 'generated-child-id' },
      feedingIdGenerator: { generate: () => 'generated-feeding-id' },
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
      childIdGenerator: { generate: () => 'generated-child-id' },
      feedingIdGenerator: { generate: () => 'generated-feeding-id' },
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
      childIdGenerator: {
        generate: () => {
          throw new Error('raw native UUID failure');
        },
      },
      feedingIdGenerator: { generate: () => 'generated-feeding-id' },
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
});
