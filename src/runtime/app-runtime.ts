import {
  getActiveChildSummary as getActiveChildSummaryUseCase,
  type ActiveChildSummary,
} from '../features/children/application/get-active-child-summary';
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
import { listChildren as listChildrenUseCase } from '../features/children/application/list-children';
import {
  getChildrenBootstrapStatus as getChildrenBootstrapStatusUseCase,
  type ChildrenBootstrapStatus,
} from '../features/children/application/get-children-bootstrap-status';
import type { CalendarDate } from '../features/children/domain/calendar-date';
import type { Child } from '../features/children/domain/child';
import type { FeedingIdGenerator } from '../features/feeding/application/feeding-id-generator';
import type { FeedingRepository } from '../features/feeding/application/feeding-repository';
import type { BreastfeedingTimerRepository } from '../features/feeding/application/breastfeeding-timer-repository';
import {
  BreastfeedingTimerApplicationError,
  completeTimer as completeTimerUseCase,
  discardTimer as discardTimerUseCase,
  finishTimer as finishTimerUseCase,
  pauseTimer as pauseTimerUseCase,
  recoverRunningTimerAfterClockRollback,
  resumeTimer as resumeTimerUseCase,
  startTimer as startTimerUseCase,
  switchTimerSide as switchTimerSideUseCase,
} from '../features/feeding/application/breastfeeding-timer';
import { recordFeeding as recordFeedingUseCase } from '../features/feeding/application/record-feeding';
import type {
  FeedingDetails,
  FeedingEvent,
} from '../features/feeding/domain/feeding-event';
import type {
  BreastSide,
  BreastfeedingTimerSession,
} from '../features/feeding/domain/breastfeeding-timer';

export type ChildrenRuntime = Readonly<{
  createChild(request: CreateChildRequest): Promise<Child>;
  getBootstrapStatus(): Promise<ChildrenBootstrapStatus>;
  getChildById(id: string): Promise<Child | null>;
  getActiveChild(): Promise<Child | null>;
  getActiveChildSummary(): Promise<ActiveChildSummary | null>;
  listChildren(): Promise<readonly Child[]>;
  setActiveChild(id: string): Promise<Child>;
}>;

export type FeedingRuntime = Readonly<{
  recordFeeding(details: FeedingDetails): Promise<FeedingEvent>;
  getBreastfeedingTimer(): Promise<BreastfeedingTimerRuntimeState>;
  startBreastfeedingTimer(side: BreastSide): Promise<BreastfeedingTimerRuntimeState>;
  pauseBreastfeedingTimer(): Promise<BreastfeedingTimerRuntimeState>;
  resumeBreastfeedingTimer(): Promise<BreastfeedingTimerRuntimeState>;
  switchBreastfeedingSide(): Promise<BreastfeedingTimerRuntimeState>;
  finishBreastfeedingTimer(): Promise<BreastfeedingTimerRuntimeState>;
  discardBreastfeedingTimer(): Promise<BreastfeedingTimerRuntimeState>;
  saveFinishedBreastfeedingTimer(): Promise<FeedingEvent>;
}>;

export type BreastfeedingTimerRuntimeState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{
      status: 'ready' | 'active-child-mismatch';
      session: BreastfeedingTimerSession;
      clockMovedBackward: boolean;
    }>;

export type AppRuntime = Readonly<{
  children: ChildrenRuntime;
  feeding: FeedingRuntime;
  close(): Promise<void>;
}>;

export class FeedingRuntimeError extends Error {
  readonly code = 'active-child-required' as const;

  constructor() {
    super('An active child is required to record feeding.');
    this.name = 'FeedingRuntimeError';
  }
}

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
  createFeedingRepository(database: TDatabase): FeedingRepository;
  createBreastfeedingTimerRepository(database: TDatabase): BreastfeedingTimerRepository;
  childIdGenerator: ChildIdGenerator;
  feedingIdGenerator: FeedingIdGenerator;
  getCurrentCalendarDate(): CalendarDate;
  getCurrentEpochMs(): number;
}>;

type InitializedRuntime<TDatabase extends RuntimeDatabaseConnection> = Readonly<{
  database: TDatabase;
  activeChildRepository: ActiveChildRepository;
  childRepository: ChildRepository;
  feedingRepository: FeedingRepository;
  breastfeedingTimerRepository: BreastfeedingTimerRepository;
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

    async listChildren() {
      try {
        return await repository.listChildren();
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

function sanitizeFeedingRepository(repository: FeedingRepository): FeedingRepository {
  return {
    async save(event) {
      try {
        await repository.save(event);
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
  };
}

function sanitizeFeedingIdGenerator(generator: FeedingIdGenerator): FeedingIdGenerator {
  return {
    generate() {
      try {
        const id = generator.generate();
        if (id.trim().length === 0) {
          throw new Error('Invalid generated feeding ID.');
        }
        return id;
      } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
  };
}

function sanitizeBreastfeedingTimerRepository(
  repository: BreastfeedingTimerRepository,
): BreastfeedingTimerRepository {
  return {
    async get() {
      try { return await repository.get(); } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
    async create(session) {
      try { await repository.create(session); } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
    async replace(session) {
      try { await repository.replace(session); } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
    async discard(sessionId) {
      try { await repository.discard(sessionId); } catch {
        throw new AppRuntimeError('local-data-unavailable');
      }
    },
    async complete(sessionId, event) {
      try { await repository.complete(sessionId, event); } catch {
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
  let timerBusy = false;
  let feedingWriteTail: Promise<void> = Promise.resolve();
  const activeOperations = new Set<Promise<void>>();
  const childIdGenerator = sanitizeChildIdGenerator(dependencies.childIdGenerator);
  const feedingIdGenerator = sanitizeFeedingIdGenerator(
    dependencies.feedingIdGenerator,
  );

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
      let feedingRepository: FeedingRepository;
      let breastfeedingTimerRepository: BreastfeedingTimerRepository;

      try {
        activeChildRepository = sanitizeActiveChildRepository(
          dependencies.createActiveChildRepository(database),
        );
        childRepository = sanitizeChildRepository(
          dependencies.createChildRepository(database),
        );
        feedingRepository = sanitizeFeedingRepository(
          dependencies.createFeedingRepository(database),
        );
        breastfeedingTimerRepository = sanitizeBreastfeedingTimerRepository(
          dependencies.createBreastfeedingTimerRepository(database),
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
        feedingRepository,
        breastfeedingTimerRepository,
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

  function readTimerClock(): number {
    try {
      const value = dependencies.getCurrentEpochMs();
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('Invalid runtime clock value.');
      }
      return value;
    } catch {
      throw new AppRuntimeError('local-data-unavailable');
    }
  }

  function timerDependencies(repository: BreastfeedingTimerRepository) {
    return { repository, clock: { now: readTimerClock } } as const;
  }

  function runTimerOperation<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    if (timerBusy) {
      return Promise.reject(new BreastfeedingTimerApplicationError('timer-busy'));
    }
    timerBusy = true;
    return runOperation(operation).finally(() => {
      timerBusy = false;
    });
  }

  function runSerializedFeedingWrite<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    let release!: () => void;
    const previous = feedingWriteTail;
    feedingWriteTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous.then(operation).finally(release);
  }

  function timerMutation<TResult>(
    operation: (
      repository: BreastfeedingTimerRepository,
      activeChildId: string,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    return runTimerOperation(async () => {
      const { activeChildRepository, childRepository, breastfeedingTimerRepository } =
        await initialize();
      const activeChild = await getActiveChildUseCase({
        activeChildRepository,
        childRepository,
      });
      if (activeChild === null) throw new FeedingRuntimeError();
      return operation(breastfeedingTimerRepository, activeChild.id);
    });
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

    getActiveChildSummary() {
      return runOperation(async () => {
        const { activeChildRepository, childRepository } = await initialize();
        try {
          return await getActiveChildSummaryUseCase(
            { activeChildRepository, childRepository },
            dependencies.getCurrentCalendarDate(),
          );
        } catch {
          // Includes an invalid device clock or unexpected domain/data failures.
          throw new AppRuntimeError('local-data-unavailable');
        }
      });
    },

    listChildren() {
      return runOperation(async () => {
        const { childRepository } = await initialize();

        return listChildrenUseCase(childRepository);
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

  const feeding: FeedingRuntime = {
    recordFeeding(details) {
      return runOperation(async () => {
        const {
          activeChildRepository,
          childRepository,
          feedingRepository,
        } = await initialize();
        const activeChild = await getActiveChildUseCase({
          activeChildRepository,
          childRepository,
        });

        if (activeChild === null) {
          throw new FeedingRuntimeError();
        }

        let occurredAtEpochMs: number;
        try {
          occurredAtEpochMs = dependencies.getCurrentEpochMs();
          if (!Number.isSafeInteger(occurredAtEpochMs) || occurredAtEpochMs < 0) {
            throw new Error('Invalid runtime clock value.');
          }
        } catch {
          throw new AppRuntimeError('local-data-unavailable');
        }

        return runSerializedFeedingWrite(() =>
          recordFeedingUseCase(
            { feedingIdGenerator, feedingRepository },
            activeChild.id,
            occurredAtEpochMs,
            details,
          ),
        );
      });
    },

    getBreastfeedingTimer() {
      return runTimerOperation(async () => {
        const { activeChildRepository, childRepository, breastfeedingTimerRepository } =
          await initialize();
        const session = await breastfeedingTimerRepository.get();
        if (session === null) return { status: 'idle' };
        const activeChild = await getActiveChildUseCase({
          activeChildRepository,
          childRepository,
        });
        if (activeChild === null || activeChild.id !== session.childId) {
          return {
            status: 'active-child-mismatch',
            session,
            clockMovedBackward: false,
          };
        }
        if (session.status === 'running') {
          const result = await recoverRunningTimerAfterClockRollback(
            timerDependencies(breastfeedingTimerRepository),
            activeChild.id,
            session,
          );
          return { status: 'ready', ...result };
        }
        return { status: 'ready', session, clockMovedBackward: false };
      });
    },

    startBreastfeedingTimer(side) {
      return timerMutation(async (repository, childId) => ({
        status: 'ready',
        ...await startTimerUseCase({
          ...timerDependencies(repository),
          idGenerator: feedingIdGenerator,
        }, childId, side),
      }));
    },

    pauseBreastfeedingTimer() {
      return timerMutation(async (repository, childId) => ({
        status: 'ready',
        ...await pauseTimerUseCase(timerDependencies(repository), childId),
      }));
    },

    resumeBreastfeedingTimer() {
      return timerMutation(async (repository, childId) => ({
        status: 'ready',
        ...await resumeTimerUseCase(timerDependencies(repository), childId),
      }));
    },

    switchBreastfeedingSide() {
      return timerMutation(async (repository, childId) => ({
        status: 'ready',
        ...await switchTimerSideUseCase(timerDependencies(repository), childId),
      }));
    },

    finishBreastfeedingTimer() {
      return timerMutation(async (repository, childId) => ({
        status: 'ready',
        ...await finishTimerUseCase(timerDependencies(repository), childId),
      }));
    },

    discardBreastfeedingTimer() {
      return timerMutation((repository, childId) =>
        runSerializedFeedingWrite(async () => {
          await discardTimerUseCase(repository, childId);
          return { status: 'idle' };
        }));
    },

    saveFinishedBreastfeedingTimer() {
      return timerMutation((repository, childId) =>
        runSerializedFeedingWrite(() => completeTimerUseCase(
          { repository, idGenerator: feedingIdGenerator },
          childId,
        )));
    },
  };

  return {
    children,
    feeding,
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
