import { compareCalendarDates, createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';
import type { Child } from '../../children/domain/child';
import { createGrowthMeasurement, type GrowthMeasurement } from '../domain/growth-measurement';
import type { GrowthHistoryCursor, GrowthRepository } from './growth-repository';

export type GrowthValues = Pick<GrowthMeasurement,
  'measuredOn' | 'weightGrams' | 'lengthMm' | 'headCircumferenceMm' | 'lengthMethod'>;
export interface GrowthIdGenerator { generate(): string }
export type GrowthApplicationErrorCode =
  | 'measurement-before-birth' | 'future-measurement' | 'measurement-not-found'
  | 'revision-conflict' | 'create-not-saved' | 'update-not-applied' | 'delete-not-applied'
  | 'mutation-outcome-uncertain' | 'local-data-unavailable';

export class GrowthApplicationError extends Error {
  constructor(
    readonly code: GrowthApplicationErrorCode,
    // Retain the exact attempted immutable session, especially its create ID.
    readonly pendingMeasurement?: GrowthMeasurement,
  ) {
    super('The growth operation is not available.');
    this.name = 'GrowthApplicationError';
  }
}

export function sameGrowthMeasurement(a: GrowthMeasurement, b: GrowthMeasurement): boolean {
  return a.id === b.id && a.childId === b.childId && a.revision === b.revision &&
    a.measuredOn === b.measuredOn && a.weightGrams === b.weightGrams &&
    a.lengthMm === b.lengthMm && a.headCircumferenceMm === b.headCircumferenceMm &&
    a.lengthMethod === b.lengthMethod;
}

function eligible(value: GrowthMeasurement, child: Child, today: CalendarDate): void {
  createCalendarDate(today);
  if (value.childId !== child.id) throw new GrowthApplicationError('revision-conflict');
  if (compareCalendarDates(value.measuredOn, child.dateOfBirth) < 0) {
    throw new GrowthApplicationError('measurement-before-birth');
  }
  if (compareCalendarDates(value.measuredOn, today) > 0) throw new GrowthApplicationError('future-measurement');
}

export async function readGrowthById(repository: GrowthRepository, childId: string, id: string): Promise<GrowthMeasurement | null> {
  try { return await repository.getById(childId, id); }
  catch { throw new GrowthApplicationError('local-data-unavailable'); }
}
export async function readGrowthHistory(
  repository: GrowthRepository, childId: string, limit: number, before: GrowthHistoryCursor | null = null,
) {
  try { return await repository.listHistory(childId, limit, before); }
  catch { throw new GrowthApplicationError('local-data-unavailable'); }
}

async function reconcile(repository: GrowthRepository, attempt: GrowthMeasurement): Promise<GrowthMeasurement | null> {
  try { return await repository.getById(attempt.childId, attempt.id); }
  catch { throw new GrowthApplicationError('mutation-outcome-uncertain', attempt); }
}

/** No replay: one INSERT, followed only by canonical read-back if it throws. */
export async function recordGrowth(
  repository: GrowthRepository, idGenerator: GrowthIdGenerator,
  child: Child, today: CalendarDate, input: GrowthValues, assertContext: () => void = () => {},
): Promise<GrowthMeasurement> {
  const measurement = createGrowthMeasurement({ ...input, id: idGenerator.generate(), childId: child.id, revision: 1 });
  eligible(measurement, child, today);
  assertContext();
  try { await repository.create(measurement); return measurement; }
  catch {
    const canonical = await reconcile(repository, measurement);
    if (canonical === null) throw new GrowthApplicationError('create-not-saved', measurement);
    if (sameGrowthMeasurement(canonical, measurement)) return canonical;
    throw new GrowthApplicationError('mutation-outcome-uncertain', measurement);
  }
}

async function originalForMutation(repository: GrowthRepository, child: Child, input: GrowthMeasurement) {
  const expected = createGrowthMeasurement(input);
  if (expected.childId !== child.id) throw new GrowthApplicationError('revision-conflict');
  const canonical = await readGrowthById(repository, child.id, expected.id);
  if (canonical === null) throw new GrowthApplicationError('measurement-not-found');
  if (!sameGrowthMeasurement(canonical, expected)) throw new GrowthApplicationError('revision-conflict');
  return expected;
}

export async function updateGrowth(
  repository: GrowthRepository, child: Child, today: CalendarDate,
  expectedInput: GrowthMeasurement, input: GrowthValues, assertContext: () => void = () => {},
): Promise<GrowthMeasurement> {
  const expected = await originalForMutation(repository, child, expectedInput);
  const replacement = createGrowthMeasurement({ ...input, id: expected.id, childId: child.id, revision: expected.revision + 1 });
  eligible(replacement, child, today);
  assertContext();
  let ambiguous = false;
  try { if (await repository.updateIfMatches(expected, replacement)) return replacement; }
  catch { ambiguous = true; }
  const canonical = await reconcile(repository, replacement);
  if (canonical !== null && sameGrowthMeasurement(canonical, replacement)) return canonical;
  if (canonical !== null && sameGrowthMeasurement(canonical, expected)) {
    throw new GrowthApplicationError('update-not-applied', replacement);
  }
  if (canonical !== null && canonical.revision !== expected.revision) {
    // The target revision with different payload cannot prove our attempted write succeeded.
    if (ambiguous && canonical.revision === replacement.revision) {
      throw new GrowthApplicationError('mutation-outcome-uncertain', replacement);
    }
    throw new GrowthApplicationError('revision-conflict', replacement);
  }
  if (canonical === null && !ambiguous) throw new GrowthApplicationError('measurement-not-found');
  throw new GrowthApplicationError(ambiguous ? 'mutation-outcome-uncertain' : 'revision-conflict', replacement);
}

export async function deleteGrowth(
  repository: GrowthRepository, child: Child, expectedInput: GrowthMeasurement,
  assertContext: () => void = () => {},
): Promise<void> {
  const expected = await originalForMutation(repository, child, expectedInput);
  assertContext();
  let ambiguous = false;
  try { if (await repository.deleteIfMatches(expected)) return; }
  catch { ambiguous = true; }
  const canonical = await reconcile(repository, expected);
  if (canonical === null) return; // Canonical absence confirms the desired deletion.
  if (sameGrowthMeasurement(canonical, expected)) throw new GrowthApplicationError('delete-not-applied', expected);
  if (canonical.revision !== expected.revision) throw new GrowthApplicationError('revision-conflict', expected);
  throw new GrowthApplicationError(ambiguous ? 'mutation-outcome-uncertain' : 'revision-conflict', expected);
}

export type PendingGrowthMutation = Readonly<{
  action: 'record' | 'update' | 'delete';
  attempt: GrowthMeasurement;
  expected?: GrowthMeasurement;
}>;
export type GrowthMutationCheck = Readonly<{ status: 'success' | 'not-applied' | 'conflict' | 'uncertain' }>;

/** Read-only reconciliation for presentation recovery; never invokes a mutation. */
export async function checkGrowthMutation(repository: GrowthRepository, pending: PendingGrowthMutation): Promise<GrowthMutationCheck> {
  const attempt = createGrowthMeasurement(pending.attempt);
  const expected = pending.expected === undefined ? undefined : createGrowthMeasurement(pending.expected);
  if (pending.action !== 'record' && (expected === undefined || expected.id !== attempt.id || expected.childId !== attempt.childId)) {
    throw new GrowthApplicationError('revision-conflict');
  }
  const canonical = await reconcile(repository, attempt);
  if (pending.action === 'record') {
    return { status: canonical === null ? 'not-applied' : sameGrowthMeasurement(canonical, attempt) ? 'success' : 'uncertain' };
  }
  if (pending.action === 'delete') {
    if (canonical === null) return { status: 'success' };
    if (sameGrowthMeasurement(canonical, expected!)) return { status: 'not-applied' };
    return { status: canonical.revision !== expected!.revision ? 'conflict' : 'uncertain' };
  }
  if (canonical !== null && sameGrowthMeasurement(canonical, attempt)) return { status: 'success' };
  if (canonical !== null && sameGrowthMeasurement(canonical, expected!)) return { status: 'not-applied' };
  return { status: canonical !== null && canonical.revision !== expected!.revision && canonical.revision !== attempt.revision ? 'conflict' : 'uncertain' };
}
