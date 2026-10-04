import type { ActiveChildRepository } from '../features/children/application/active-child-repository';
import {
  getActiveChild as getActiveChildUseCase,
  setActiveChild as setActiveChildUseCase,
} from '../features/children/application/active-child';
import type { ChildIdGenerator } from '../features/children/application/child-id-generator';
import type { ChildRepository } from '../features/children/application/child-repository';
import {
  createChildUseCase,
  type CreateChildRequest,
} from '../features/children/application/create-child';
import { getChildById as getChildByIdUseCase } from '../features/children/application/get-child-by-id';
import {
  getChildrenBootstrapStatus as getChildrenBootstrapStatusUseCase,
  type ChildrenBootstrapStatus,
} from '../features/children/application/get-children-bootstrap-status';
import type { CalendarDate } from '../features/children/domain/calendar-date';
import type { Child } from '../features/children/domain/child';

export type ChildrenRuntime = Readonly<{
  createChild(request: CreateChildRequest): Promise<Child>;
  getBootstrapStatus(): Promise<ChildrenBootstrapStatus>;
  getChildById(id: string): Promise<Child | null>;
  getActiveChild(): Promise<Child | null>;
  setActiveChild(id: string): Promise<Child>;
}>;

export type AppRuntime = Readonly<{
  children: ChildrenRuntime;
  close(): Promise<void>;
}>;

export type AppRuntimeErrorCode = 'local-data-unavailable' | 'runtime-closed';

export class AppRuntimeError extends Error {
  constructor(readonly code: AppRuntimeErrorCode) {
    super(
      code === 'runtime-closed'
        ? 'The application runtime is closed.'
        : 'Local data is currently unavailable.',
    );
    this.name = 'AppRuntimeError';
  }
}

export interface RuntimeDatabaseConnection {
  closeAsync(): Promise<void>;
}

export type AppRuntimeDependencies<TDatabase extends RuntimeDatabaseConnection> = Readonly<{
  openDatabase(): Promise<TDatabase>;
  createActiveChildRepository(database: TDatabase): ActiveChildRepository;
  createChildRepository(database: TDatabase): ChildRepository;
  childIdGenerator: ChildIdGenerator;
  getCurrentCalendarDate(): CalendarDate;
}>;

type InitializedRuntime<TDatabase extends RuntimeDatabaseConnection> = Readonly<{
  database: TDatabase;
  activeChildRepository: ActiveChildRepository;
  childRepository: ChildRepository;
}>;

function sanitizeActiveChildRepository(
  repository: ActiveChildRepository,
): ActiveChildRepository {
  return {
    async getActiveChildId() {
      try {
        return await repository.getActiveChildId();
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },

    async setActiveChildId(id) {
      try {
        await repository.setActiveChildId(id);
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },

    async setActiveChildIdIfUnset(id) {
      try {
        await repository.setActiveChildIdIfUnset(id);
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },

    async clearActiveChildIdIfMatches(id) {
      try {
        await repository.clearActiveChildIdIfMatches(id);
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
  };
}

function sanitizeChildRepository(repository: ChildRepository): ChildRepository {
  return {
    async getById(id) {
      try {
        return await repository.getById(id);
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },

    async hasChildren() {
      try {
        return await repository.hasChildren();
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },

    async save(child) {
      try {
        await repository.save(child);
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
  };
}

function sanitizeChildIdGenerator(generator: ChildIdGenerator): ChildIdGenerator {
  return {
    generate() {
      try {
        return generator.generate();
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
  };
}

export function createAppRuntime<TDatabase extends RuntimeDatabaseConnection>(
  dependencies: AppRuntimeDependencies<TDatabase>,
): AppRuntime {
  let initializedRuntime: InitializedRuntime<TDatabase> | null = null;
  let initializationPromise: Promise<InitializedRuntime<TDatabase>> | null = null;
  let closePromise: Promise<void> | null = null;
  let closed = false;
  const activeOperations = new Set<Promise<void>>();
  const childIdGenerator = sanitizeChildIdGenerator(dependencies.childIdGenerator);

  async function closeDatabase(database: TDatabase): Promise<void> {
    try {
      await database.closeAsync();
    } catch {
      throw new AppRuntimeError('local-data-unavailable');
    }
  }

  async function initialize(): Promise<InitializedRuntime<TDatabase>> {
    if (closed) {
      throw new AppRuntimeError('runtime-closed');
    }

    if (initializedRuntime !== null) {
      return initializedRuntime;
    }

    if (initializationPromise !== null) {
      return initializationPromise;
    }

    const currentInitialization = (async () => {
      let database: TDatabase;

      try {
        database = await dependencies.openDatabase();
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }

      if (closed) {
        await closeDatabase(database);
        throw new AppRuntimeError('runtime-closed');
      }

      let childRepository: ChildRepository;
      let activeChildRepository: ActiveChildRepository;

      try {
        activeChildRepository = sanitizeActiveChildRepository(
          dependencies.createActiveChildRepository(database),
        );
        childRepository = sanitizeChildRepository(
          dependencies.createChildRepository(database),
        );
      } catch {
        await closeDatabase(database);
        throw new AppRuntimeError('local-data-unavailable');
      }

      if (closed) {
        await closeDatabase(database);
        throw new AppRuntimeError('runtime-closed');
      }

      initializedRuntime = {
        database,
        activeChildRepository,
        childRepository,
      };
      return initializedRuntime;
    })();

    initializationPromise = currentInitialization;

    try {
      return await currentInitialization;
    } finally {
      if (initializationPromise === currentInitialization) {
        initializationPromise = null;
      }
    }
  }

  function runOperation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    if (closed) {
      return Promise.reject(new AppRuntimeError('runtime-closed'));
    }

    let markComplete!: () => void;
    const completion = new Promise<void>((resolve) => {
      markComplete = resolve;
    });
    activeOperations.add(completion);

    return (async () => {
      try {
        return await operation();
      } finally {
        activeOperations.delete(completion);
        markComplete();
      }
    })();
  }

  const children: ChildrenRuntime = {
    createChild(request) {
      return runOperation(async () => {
        const { activeChildRepository, childRepository } = await initialize();
        let asOf: CalendarDate;

        try {
          asOf = dependencies.getCurrentCalendarDate();
        } catch {
          throw new AppRuntimeError('local-data-unavailable');
        }

        return createChildUseCase(
          { activeChildRepository, childRepository, childIdGenerator },
          request,
          asOf,
        );
      });
    },

    getBootstrapStatus() {
      return runOperation(async () => {
        const { activeChildRepository, childRepository } = await initialize();

        return getChildrenBootstrapStatusUseCase({
          activeChildRepository,
          childRepository,
        });
      });
    },

    getChildById(id) {
      return runOperation(async () => {
        const { childRepository } = await initialize();

        return getChildByIdUseCase(childRepository, id);
      });
    },

    getActiveChild() {
      return runOperation(async () => {
        const { activeChildRepository, childRepository } = await initialize();

        return getActiveChildUseCase({ activeChildRepository, childRepository });
      });
    },

    setActiveChild(id) {
      return runOperation(async () => {
        const { activeChildRepository, childRepository } = await initialize();

        return setActiveChildUseCase(
          { activeChildRepository, childRepository },
          id,
        );
      });
    },
  };

  return {
    children,
    close() {
      if (closePromise !== null) {
        return closePromise;
      }

      closed = true;
      const operationsToFinish = [...activeOperations];

      closePromise = (async () => {
        await Promise.all(operationsToFinish);

        const database = initializedRuntime?.database ?? null;
        initializedRuntime = null;

        if (database !== null) {
          await closeDatabase(database);
        }
      })();

      return closePromise;
    },
  };
}
