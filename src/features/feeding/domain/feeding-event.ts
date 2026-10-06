export const bottleContentsValues = [
  'expressed-breast-milk',
  'formula',
  'mixed',
] as const;

export type BottleContents = (typeof bottleContentsValues)[number];

type FeedingEventCommon = Readonly<{
  id: string;
  childId: string;
  occurredAtEpochMs: number;
}>;

export type BreastFeedingEvent = FeedingEventCommon &
  Readonly<{
    kind: 'breast';
    leftDurationSeconds: number;
    rightDurationSeconds: number;
  }>;

export type BottleFeedingEvent = FeedingEventCommon &
  Readonly<{
    kind: 'bottle';
    amountMl: number;
    contents: BottleContents;
  }>;

export type FeedingEvent = BreastFeedingEvent | BottleFeedingEvent;

export type FeedingDetails =
  | Readonly<{
      kind: 'breast';
      leftDurationSeconds: number;
      rightDurationSeconds: number;
    }>
  | Readonly<{
      kind: 'bottle';
      amountMl: number;
      contents: BottleContents;
    }>;

export type FeedingValidationErrorCode =
  | 'invalid-amount'
  | 'invalid-contents'
  | 'invalid-duration'
  | 'invalid-identity'
  | 'invalid-timestamp';

export class FeedingValidationError extends Error {
  constructor(readonly code: FeedingValidationErrorCode) {
    super('The feeding event is invalid.');
    this.name = 'FeedingValidationError';
  }
}

function isBottleContents(value: unknown): value is BottleContents {
  return bottleContentsValues.includes(value as BottleContents);
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function amountMlToTenths(amountMl: number): number {
  const tenths = amountMl * 10;

  if (!Number.isFinite(amountMl) || amountMl <= 0 || !Number.isSafeInteger(tenths)) {
    throw new FeedingValidationError('invalid-amount');
  }

  return tenths;
}

export function createFeedingEvent(
  input: FeedingEventCommon & FeedingDetails,
): FeedingEvent {
  if (input.id.trim().length === 0 || input.childId.trim().length === 0) {
    throw new FeedingValidationError('invalid-identity');
  }

  if (!isNonNegativeSafeInteger(input.occurredAtEpochMs)) {
    throw new FeedingValidationError('invalid-timestamp');
  }

  if (input.kind === 'breast') {
    if (
      !isNonNegativeSafeInteger(input.leftDurationSeconds) ||
      !isNonNegativeSafeInteger(input.rightDurationSeconds) ||
      input.leftDurationSeconds + input.rightDurationSeconds <= 0
    ) {
      throw new FeedingValidationError('invalid-duration');
    }

    return {
      id: input.id,
      childId: input.childId,
      occurredAtEpochMs: input.occurredAtEpochMs,
      kind: 'breast',
      leftDurationSeconds: input.leftDurationSeconds,
      rightDurationSeconds: input.rightDurationSeconds,
    };
  }

  amountMlToTenths(input.amountMl);
  if (!isBottleContents(input.contents)) {
    throw new FeedingValidationError('invalid-contents');
  }

  return {
    id: input.id,
    childId: input.childId,
    occurredAtEpochMs: input.occurredAtEpochMs,
    kind: 'bottle',
    amountMl: input.amountMl,
    contents: input.contents,
  };
}
