import type { Child } from '../../children/domain/child';
import { createReminder, MAX_REMINDER_EPOCH_MS, type Reminder } from '../domain/reminder';
import type { ReminderCursor, ReminderPage, ReminderRepository } from './reminder-repository';

export type ReminderValues = Readonly<{
  title: string;
  scheduledAtEpochMs: number;
}>;

export interface ReminderIdGenerator {
  generate(): string;
}

export type ReminderApplicationErrorCode =
  | 'reminder-not-in-future'
  | 'reminder-not-found'
  | 'revision-conflict'
  | 'create-not-saved'
  | 'update-not-applied'
  | 'delete-not-applied'
  | 'mutation-outcome-uncertain'
  | 'local-data-unavailable';

export class ReminderApplicationError extends Error {
  constructor(
    readonly code: ReminderApplicationErrorCode,
    readonly pendingReminder?: Reminder,
  ) {
    super('The reminder operation is not available.');
    this.name = 'ReminderApplicationError';
  }
}

export function sameReminder(left: Reminder, right: Reminder): boolean {
  return left.id === right.id && left.childId === right.childId &&
    left.title === right.title && left.scheduledAtEpochMs === right.scheduledAtEpochMs &&
    left.revision === right.revision;
}

function assertEligible(reminder: Reminder, child: Child, nowEpochMs: number): void {
  if (
    !Number.isSafeInteger(nowEpochMs) || nowEpochMs < -MAX_REMINDER_EPOCH_MS ||
    nowEpochMs > MAX_REMINDER_EPOCH_MS || Number.isNaN(new Date(nowEpochMs).getTime())
  ) {
    throw new ReminderApplicationError('local-data-unavailable');
  }
  if (reminder.childId !== child.id) throw new ReminderApplicationError('revision-conflict');
  if (reminder.scheduledAtEpochMs <= nowEpochMs) {
    throw new ReminderApplicationError('reminder-not-in-future');
  }
}

export async function readReminderById(
  repository: ReminderRepository,
  childId: string,
  id: string,
): Promise<Reminder | null> {
  try { return await repository.getById(childId, id); }
  catch { throw new ReminderApplicationError('local-data-unavailable'); }
}

export async function readReminderList(
  repository: ReminderRepository,
  childId: string,
  limit: number,
  before: ReminderCursor | null = null,
): Promise<ReminderPage> {
  try { return await repository.listByChild(childId, limit, before); }
  catch { throw new ReminderApplicationError('local-data-unavailable'); }
}

export async function readUpcomingReminders(
  repository: ReminderRepository,
  childId: string,
  boundaryEpochMs: number,
  limit: number,
  after: ReminderCursor | null = null,
): Promise<ReminderPage> {
  try {
    return await repository.listUpcomingByChild(childId, boundaryEpochMs, limit, after);
  } catch {
    throw new ReminderApplicationError('local-data-unavailable');
  }
}

export async function readPastReminders(
  repository: ReminderRepository,
  childId: string,
  boundaryEpochMs: number,
  limit: number,
  before: ReminderCursor | null = null,
): Promise<ReminderPage> {
  try {
    return await repository.listPastByChild(childId, boundaryEpochMs, limit, before);
  } catch {
    throw new ReminderApplicationError('local-data-unavailable');
  }
}

async function reconcile(
  repository: ReminderRepository,
  attempt: Reminder,
): Promise<Reminder | null> {
  try { return await repository.getById(attempt.childId, attempt.id); }
  catch { throw new ReminderApplicationError('mutation-outcome-uncertain', attempt); }
}

export async function recordReminder(
  repository: ReminderRepository,
  idGenerator: ReminderIdGenerator,
  child: Child,
  nowEpochMs: number,
  values: ReminderValues,
  assertContext: () => void = () => {},
): Promise<Reminder> {
  const reminder = createReminder({
    ...values,
    id: idGenerator.generate(),
    childId: child.id,
    revision: 1,
  });
  assertEligible(reminder, child, nowEpochMs);
  assertContext();
  try {
    await repository.create(reminder);
    return reminder;
  } catch {
    const canonical = await reconcile(repository, reminder);
    if (canonical === null) throw new ReminderApplicationError('create-not-saved', reminder);
    if (sameReminder(canonical, reminder)) return canonical;
    throw new ReminderApplicationError('mutation-outcome-uncertain', reminder);
  }
}

async function originalForMutation(
  repository: ReminderRepository,
  child: Child,
  input: Reminder,
): Promise<Reminder> {
  const expected = createReminder(input);
  if (expected.childId !== child.id) throw new ReminderApplicationError('revision-conflict');
  const canonical = await readReminderById(repository, child.id, expected.id);
  if (canonical === null) throw new ReminderApplicationError('reminder-not-found');
  if (!sameReminder(canonical, expected)) throw new ReminderApplicationError('revision-conflict');
  return expected;
}

export async function updateReminder(
  repository: ReminderRepository,
  child: Child,
  nowEpochMs: number,
  expectedInput: Reminder,
  values: ReminderValues,
  assertContext: () => void = () => {},
): Promise<Reminder> {
  const expected = await originalForMutation(repository, child, expectedInput);
  const replacement = createReminder({
    ...values,
    id: expected.id,
    childId: child.id,
    revision: expected.revision + 1,
  });
  assertEligible(replacement, child, nowEpochMs);
  assertContext();
  let ambiguous = false;
  try {
    if (await repository.updateIfMatches(expected, replacement)) return replacement;
  } catch {
    ambiguous = true;
  }
  const canonical = await reconcile(repository, replacement);
  if (canonical !== null && sameReminder(canonical, replacement)) return canonical;
  if (canonical !== null && sameReminder(canonical, expected)) {
    throw new ReminderApplicationError('update-not-applied', replacement);
  }
  if (canonical !== null && canonical.revision !== expected.revision) {
    if (ambiguous && canonical.revision === replacement.revision) {
      throw new ReminderApplicationError('mutation-outcome-uncertain', replacement);
    }
    throw new ReminderApplicationError('revision-conflict', replacement);
  }
  if (canonical === null && !ambiguous) throw new ReminderApplicationError('reminder-not-found');
  throw new ReminderApplicationError(
    ambiguous ? 'mutation-outcome-uncertain' : 'revision-conflict',
    replacement,
  );
}

export async function deleteReminder(
  repository: ReminderRepository,
  child: Child,
  expectedInput: Reminder,
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
  if (sameReminder(canonical, expected)) {
    throw new ReminderApplicationError('delete-not-applied', expected);
  }
  if (canonical.revision !== expected.revision) {
    throw new ReminderApplicationError('revision-conflict', expected);
  }
  throw new ReminderApplicationError(
    ambiguous ? 'mutation-outcome-uncertain' : 'revision-conflict',
    expected,
  );
}

export type PendingReminderMutation = Readonly<{
  action: 'record' | 'update' | 'delete';
  attempt: Reminder;
  expected?: Reminder;
}>;

export type ReminderMutationCheck = Readonly<{
  status: 'success' | 'not-applied' | 'conflict' | 'uncertain';
}>;

/** Canonical read-back only; this operation never repeats a mutation. */
export async function checkReminderMutation(
  repository: ReminderRepository,
  pending: PendingReminderMutation,
): Promise<ReminderMutationCheck> {
  const attempt = createReminder(pending.attempt);
  const expected = pending.expected === undefined ? undefined : createReminder(pending.expected);
  if (
    pending.action !== 'record' &&
    (expected === undefined || expected.id !== attempt.id || expected.childId !== attempt.childId)
  ) {
    throw new ReminderApplicationError('revision-conflict');
  }
  const canonical = await reconcile(repository, attempt);
  if (pending.action === 'record') {
    return { status: canonical === null ? 'not-applied' : sameReminder(canonical, attempt) ? 'success' : 'uncertain' };
  }
  if (pending.action === 'delete') {
    if (canonical === null) return { status: 'success' };
    if (sameReminder(canonical, expected!)) return { status: 'not-applied' };
    return { status: canonical.revision !== expected!.revision ? 'conflict' : 'uncertain' };
  }
  if (canonical !== null && sameReminder(canonical, attempt)) return { status: 'success' };
  if (canonical !== null && sameReminder(canonical, expected!)) return { status: 'not-applied' };
  return {
    status: canonical !== null &&
      canonical.revision !== expected!.revision && canonical.revision !== attempt.revision
      ? 'conflict'
      : 'uncertain',
  };
}
