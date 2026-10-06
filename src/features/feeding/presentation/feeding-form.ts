import {
  amountMlToTenths,
  FeedingValidationError,
  type BottleContents,
  type FeedingDetails,
} from '../domain/feeding-event';

function parseLocalizedNumber(value: string, emptyValue?: number): number {
  const normalized = value.trim().replace(',', '.');

  if (normalized.length === 0 && emptyValue !== undefined) {
    return emptyValue;
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Number.NaN;
  }

  return Number(normalized);
}

function minutesToSeconds(value: string): number {
  const minutes = parseLocalizedNumber(value, 0);
  const seconds = minutes * 60;

  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new FeedingValidationError('invalid-duration');
  }

  return seconds;
}

export function createBreastFeedingDetails(
  leftMinutes: string,
  rightMinutes: string,
): FeedingDetails {
  const details = {
    kind: 'breast',
    leftDurationSeconds: minutesToSeconds(leftMinutes),
    rightDurationSeconds: minutesToSeconds(rightMinutes),
  } as const;

  if (details.leftDurationSeconds + details.rightDurationSeconds <= 0) {
    throw new FeedingValidationError('invalid-duration');
  }

  return details;
}

export function createBottleFeedingDetails(
  amount: string,
  contents: BottleContents,
): FeedingDetails {
  const amountMl = parseLocalizedNumber(amount);
  amountMlToTenths(amountMl);

  return { kind: 'bottle', amountMl, contents };
}
