import { createDiaperEvent, type DiaperEvent, type DiaperKind } from '../domain/diaper-event';
import type { DiaperIdGenerator } from './diaper-id-generator';
import type { DiaperRepository } from './diaper-repository';

export const RECENT_DIAPER_LIMIT = 20;

export type DiaperApplicationErrorCode =
  | 'future-diaper'
  | 'diaper-not-saved'
  | 'diaper-outcome-uncertain'
  | 'diaper-event-not-found'
  | 'diaper-event-changed'
  | 'diaper-delete-not-applied'
  | 'diaper-update-not-applied'
  | 'diaper-mutation-outcome-uncertain';

export class DiaperApplicationError extends Error {
  constructor(readonly code: DiaperApplicationErrorCode) {
    super('The diaper operation is not available.');
    this.name = 'DiaperApplicationError';
  }
}

export function sameDiaperEvent(left: DiaperEvent, right: DiaperEvent): boolean {
  return left.id === right.id && left.childId === right.childId &&
    left.occurredAtEpochMs === right.occurredAtEpochMs && left.kind === right.kind;
}

export async function recordDiaper(
  dependencies: Readonly<{
    repository: DiaperRepository;
    idGenerator: DiaperIdGenerator;
  }>,
  childId: string,
  occurredAtEpochMs: number,
  currentEpochMs: number,
  kind: DiaperKind,
): Promise<DiaperEvent> {
  if (occurredAtEpochMs > currentEpochMs) {
    throw new DiaperApplicationError('future-diaper');
  }
  const event = createDiaperEvent({
    id: dependencies.idGenerator.generate(), childId, occurredAtEpochMs, kind,
  });
  try {
    await dependencies.repository.save(event);
    return event;
  } catch {
    let canonical: DiaperEvent | null;
    try {
      canonical = await dependencies.repository.getById(childId, event.id);
    } catch {
      throw new DiaperApplicationError('diaper-outcome-uncertain');
    }
    if (canonical === null) throw new DiaperApplicationError('diaper-not-saved');
    if (!sameDiaperEvent(canonical, event)) {
      throw new DiaperApplicationError('diaper-outcome-uncertain');
    }
    return canonical;
  }
}

async function readForMutation(
  repository: DiaperRepository,
  expected: DiaperEvent,
): Promise<DiaperEvent | null> {
  try {
    return await repository.getById(expected.childId, expected.id);
  } catch {
    throw new DiaperApplicationError('diaper-mutation-outcome-uncertain');
  }
}

function classifyDeleteState(
  canonical: DiaperEvent | null,
  expected: DiaperEvent,
  ambiguous: boolean,
): void {
  if (canonical === null) {
    if (ambiguous) return;
    throw new DiaperApplicationError('diaper-event-not-found');
  }
  if (sameDiaperEvent(canonical, expected)) {
    throw new DiaperApplicationError('diaper-delete-not-applied');
  }
  throw new DiaperApplicationError(
    ambiguous ? 'diaper-mutation-outcome-uncertain' : 'diaper-event-changed',
  );
}

export async function deleteDiaper(
  repository: DiaperRepository,
  expectedInput: DiaperEvent,
): Promise<void> {
  const expected = createDiaperEvent(expectedInput);
  try {
    const deleted = await repository.deleteIfMatches(expected);
    if (deleted) return;
  } catch {
    classifyDeleteState(await readForMutation(repository, expected), expected, true);
    return;
  }
  classifyDeleteState(await readForMutation(repository, expected), expected, false);
}

function classifyUpdateState(
  canonical: DiaperEvent | null,
  expected: DiaperEvent,
  replacement: DiaperEvent,
  ambiguous: boolean,
): void {
  if (canonical !== null && sameDiaperEvent(canonical, replacement)) return;
  if (canonical !== null && sameDiaperEvent(canonical, expected)) {
    throw new DiaperApplicationError('diaper-update-not-applied');
  }
  if (canonical === null && !ambiguous) {
    throw new DiaperApplicationError('diaper-event-not-found');
  }
  throw new DiaperApplicationError(
    ambiguous ? 'diaper-mutation-outcome-uncertain' : 'diaper-event-changed',
  );
}

export async function updateDiaper(
  repository: DiaperRepository,
  expectedInput: DiaperEvent,
  replacementInput: DiaperEvent,
  currentEpochMs: number,
): Promise<void> {
  const expected = createDiaperEvent(expectedInput);
  const replacement = createDiaperEvent(replacementInput);
  if (replacement.id !== expected.id || replacement.childId !== expected.childId) {
    throw new DiaperApplicationError('diaper-event-changed');
  }
  if (replacement.occurredAtEpochMs > currentEpochMs) {
    throw new DiaperApplicationError('future-diaper');
  }
  try {
    const updated = await repository.updateIfMatches(expected, replacement);
    if (updated) return;
  } catch {
    classifyUpdateState(
      await readForMutation(repository, expected), expected, replacement, true,
    );
    return;
  }
  classifyUpdateState(
    await readForMutation(repository, expected), expected, replacement, false,
  );
}

export function listRecentDiapers(
  repository: DiaperRepository,
  childId: string,
): Promise<readonly DiaperEvent[]> {
  return repository.listRecentByChildId(childId, RECENT_DIAPER_LIMIT);
}
