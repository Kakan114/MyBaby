import {
  compareCalendarDates,
  createCalendarDate,
  type CalendarDate,
} from '../../children/domain/calendar-date';
import type { Child } from '../../children/domain/child';
import {
  createMilestoneEntry,
  type MilestoneEntry,
  type MilestoneSubject,
} from '../domain/milestone-entry';
import type {
  MilestoneHistoryCursor,
  MilestoneRepository,
} from './milestone-repository';

export type MilestoneValues = Readonly<{
  subject: MilestoneSubject;
  occurredOn: CalendarDate;
  note: string | null;
}>;

export interface MilestoneIdGenerator {
  generate(): string;
}

export type MilestoneApplicationErrorCode =
  | 'milestone-before-birth'
  | 'future-milestone'
  | 'milestone-not-found'
  | 'revision-conflict'
  | 'create-not-saved'
  | 'update-not-applied'
  | 'delete-not-applied'
  | 'mutation-outcome-uncertain'
  | 'local-data-unavailable';

export class MilestoneApplicationError extends Error {
  constructor(
    readonly code: MilestoneApplicationErrorCode,
    readonly pendingEntry?: MilestoneEntry,
  ) {
    super('The milestone operation is not available.');
    this.name = 'MilestoneApplicationError';
  }
}

export function sameMilestoneEntry(left: MilestoneEntry, right: MilestoneEntry): boolean {
  const sameSubject = left.subject.kind === right.subject.kind && (
    left.subject.kind === 'predefined' && right.subject.kind === 'predefined'
      ? left.subject.definitionId === right.subject.definitionId
      : left.subject.kind === 'custom' && right.subject.kind === 'custom'
        ? left.subject.title === right.subject.title
        : false
  );
  return left.id === right.id && left.childId === right.childId &&
    left.occurredOn === right.occurredOn && left.note === right.note &&
    left.revision === right.revision && sameSubject;
}

function assertEligible(entry: MilestoneEntry, child: Child, today: CalendarDate): void {
  createCalendarDate(today);
  if (entry.childId !== child.id) throw new MilestoneApplicationError('revision-conflict');
  if (compareCalendarDates(entry.occurredOn, child.dateOfBirth) < 0) {
    throw new MilestoneApplicationError('milestone-before-birth');
  }
  if (compareCalendarDates(entry.occurredOn, today) > 0) {
    throw new MilestoneApplicationError('future-milestone');
  }
}

export async function readMilestoneById(
  repository: MilestoneRepository,
  childId: string,
  id: string,
): Promise<MilestoneEntry | null> {
  try { return await repository.getById(childId, id); }
  catch { throw new MilestoneApplicationError('local-data-unavailable'); }
}

export async function readMilestoneHistory(
  repository: MilestoneRepository,
  childId: string,
  limit: number,
  before: MilestoneHistoryCursor | null = null,
) {
  try { return await repository.listHistory(childId, limit, before); }
  catch { throw new MilestoneApplicationError('local-data-unavailable'); }
}

async function reconcile(
  repository: MilestoneRepository,
  attempt: MilestoneEntry,
): Promise<MilestoneEntry | null> {
  try { return await repository.getById(attempt.childId, attempt.id); }
  catch { throw new MilestoneApplicationError('mutation-outcome-uncertain', attempt); }
}

export async function recordMilestone(
  repository: MilestoneRepository,
  idGenerator: MilestoneIdGenerator,
  child: Child,
  today: CalendarDate,
  input: MilestoneValues,
  assertContext: () => void = () => {},
): Promise<MilestoneEntry> {
  const entry = createMilestoneEntry({
    ...input,
    id: idGenerator.generate(),
    childId: child.id,
    revision: 1,
  });
  assertEligible(entry, child, today);
  assertContext();
  try {
    await repository.create(entry);
    return entry;
  } catch {
    const canonical = await reconcile(repository, entry);
    if (canonical === null) {
      throw new MilestoneApplicationError('create-not-saved', entry);
    }
    if (sameMilestoneEntry(canonical, entry)) return canonical;
    throw new MilestoneApplicationError('mutation-outcome-uncertain', entry);
  }
}

async function originalForMutation(
  repository: MilestoneRepository,
  child: Child,
  input: MilestoneEntry,
): Promise<MilestoneEntry> {
  const expected = createMilestoneEntry(input);
  if (expected.childId !== child.id) throw new MilestoneApplicationError('revision-conflict');
  const canonical = await readMilestoneById(repository, child.id, expected.id);
  if (canonical === null) throw new MilestoneApplicationError('milestone-not-found');
  if (!sameMilestoneEntry(canonical, expected)) {
    throw new MilestoneApplicationError('revision-conflict');
  }
  return expected;
}

export async function updateMilestone(
  repository: MilestoneRepository,
  child: Child,
  today: CalendarDate,
  expectedInput: MilestoneEntry,
  input: MilestoneValues,
  assertContext: () => void = () => {},
): Promise<MilestoneEntry> {
  const expected = await originalForMutation(repository, child, expectedInput);
  const replacement = createMilestoneEntry({
    ...input,
    id: expected.id,
    childId: child.id,
    revision: expected.revision + 1,
  });
  assertEligible(replacement, child, today);
  assertContext();
  let ambiguous = false;
  try {
    if (await repository.updateIfMatches(expected, replacement)) return replacement;
  } catch {
    ambiguous = true;
  }
  const canonical = await reconcile(repository, replacement);
  if (canonical !== null && sameMilestoneEntry(canonical, replacement)) return canonical;
  if (canonical !== null && sameMilestoneEntry(canonical, expected)) {
    throw new MilestoneApplicationError('update-not-applied', replacement);
  }
  if (canonical !== null && canonical.revision !== expected.revision) {
    if (ambiguous && canonical.revision === replacement.revision) {
      throw new MilestoneApplicationError('mutation-outcome-uncertain', replacement);
    }
    throw new MilestoneApplicationError('revision-conflict', replacement);
  }
  if (canonical === null && !ambiguous) {
    throw new MilestoneApplicationError('milestone-not-found');
  }
  throw new MilestoneApplicationError(
    ambiguous ? 'mutation-outcome-uncertain' : 'revision-conflict',
    replacement,
  );
}

export async function deleteMilestone(
  repository: MilestoneRepository,
  child: Child,
  expectedInput: MilestoneEntry,
  assertContext: () => void = () => {},
): Promise<void> {
  const expected = await originalForMutation(repository, child, expectedInput);
  assertContext();
  let ambiguous = false;
  try {
    if (await repository.deleteIfMatches(expected)) return;
  } catch {
    ambiguous = true;
  }
  const canonical = await reconcile(repository, expected);
  if (canonical === null) return;
  if (sameMilestoneEntry(canonical, expected)) {
    throw new MilestoneApplicationError('delete-not-applied', expected);
  }
  if (canonical.revision !== expected.revision) {
    throw new MilestoneApplicationError('revision-conflict', expected);
  }
  throw new MilestoneApplicationError(
    ambiguous ? 'mutation-outcome-uncertain' : 'revision-conflict',
    expected,
  );
}

export type PendingMilestoneMutation = Readonly<{
  action: 'record' | 'update' | 'delete';
  attempt: MilestoneEntry;
  expected?: MilestoneEntry;
}>;

export type MilestoneMutationCheck = Readonly<{
  status: 'success' | 'not-applied' | 'conflict' | 'uncertain';
}>;

/** Canonical read-back only; this operation never repeats a mutation. */
export async function checkMilestoneMutation(
  repository: MilestoneRepository,
  pending: PendingMilestoneMutation,
): Promise<MilestoneMutationCheck> {
  const attempt = createMilestoneEntry(pending.attempt);
  const expected = pending.expected === undefined
    ? undefined
    : createMilestoneEntry(pending.expected);
  if (
    pending.action !== 'record' &&
    (expected === undefined || expected.id !== attempt.id || expected.childId !== attempt.childId)
  ) {
    throw new MilestoneApplicationError('revision-conflict');
  }
  const canonical = await reconcile(repository, attempt);
  if (pending.action === 'record') {
    return {
      status: canonical === null
        ? 'not-applied'
        : sameMilestoneEntry(canonical, attempt) ? 'success' : 'uncertain',
    };
  }
  if (pending.action === 'delete') {
    if (canonical === null) return { status: 'success' };
    if (sameMilestoneEntry(canonical, expected!)) return { status: 'not-applied' };
    return { status: canonical.revision !== expected!.revision ? 'conflict' : 'uncertain' };
  }
  if (canonical !== null && sameMilestoneEntry(canonical, attempt)) return { status: 'success' };
  if (canonical !== null && sameMilestoneEntry(canonical, expected!)) return { status: 'not-applied' };
  return {
    status: canonical !== null &&
      canonical.revision !== expected!.revision &&
      canonical.revision !== attempt.revision
      ? 'conflict'
      : 'uncertain',
  };
}

