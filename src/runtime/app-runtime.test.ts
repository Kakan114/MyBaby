import { describe, expect, it, vi } from 'vitest';

import type { ChildRepository } from '../features/children/application/child-repository';
import { createCalendarDate } from '../features/children/domain/calendar-date';
import type { Child } from '../features/children/domain/child';

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
  readonly save = vi.fn(async (child: Child) => {
    this.children.set(child.id, child);
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
}) {
  const database = new FakeDatabase();
  const childRepository = new FakeChildRepository();
  const openDatabase = vi.fn(options?.openDatabase ?? (async () => database));
  const createChildRepository = vi.fn(() => childRepository);
  const runtime = createAppRuntime({
    openDatabase,
    createChildRepository,
    childIdGenerator: { generate: () => 'generated-child-id' },
  });

  return { database, childRepository, createChildRepository, openDatabase, runtime };
}

const asOf = createCalendarDate('2025-06-15');

describe('application runtime', () => {
  it('does not initialize local data when the runtime is created', () => {
    const fixture = createRuntimeFixture();

    expect(fixture.openDatabase).not.toHaveBeenCalled();
    expect(fixture.createChildRepository).not.toHaveBeenCalled();
  });

  it('shares one pending initialization between concurrent first operations', async () => {
    const deferredDatabase = createDeferred<FakeDatabase>();
    const fixture = createRuntimeFixture({
      openDatabase: () => deferredDatabase.promise,
    });

    const createPromise = fixture.runtime.children.createChild(
      { displayName: 'Kim', dateOfBirth: '2025-01-10' },
      asOf,
    );
    const getPromise = fixture.runtime.children.getChildById('missing-child');

    expect(fixture.openDatabase).toHaveBeenCalledOnce();
    deferredDatabase.resolve(fixture.database);

    await expect(createPromise).resolves.toMatchObject({ id: 'generated-child-id' });
    await expect(getPromise).resolves.toBeNull();
    expect(fixture.createChildRepository).toHaveBeenCalledOnce();
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
      asOf,
    );

    expect(child).toEqual({
      id: 'generated-child-id',
      displayName: 'Kim',
      dateOfBirth: '2025-01-10',
    });
    expect(fixture.childRepository.save).toHaveBeenCalledWith(child);
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
      createChildRepository: () => childRepository,
      childIdGenerator: { generate: () => 'generated-child-id' },
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
      createChildRepository: () => {
        throw new Error('repository construction exposed native details');
      },
      childIdGenerator: { generate: () => 'generated-child-id' },
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
      .createChild({ displayName: '   ', dateOfBirth: '2025-01-10' }, asOf)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(AppRuntimeError);
    expect(fixture.childRepository.save).not.toHaveBeenCalled();
  });

  it('sanitizes child ID generator infrastructure failures', async () => {
    const database = new FakeDatabase();
    const runtime = createAppRuntime({
      openDatabase: async () => database,
      createChildRepository: () => new FakeChildRepository(),
      childIdGenerator: {
        generate: () => {
          throw new Error('raw native UUID failure');
        },
      },
    });

    const error = await runtime.children
      .createChild({ displayName: 'Kim', dateOfBirth: '2025-01-10' }, asOf)
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
