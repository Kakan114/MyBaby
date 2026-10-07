export const diaperKinds = ['wet', 'dirty', 'mixed'] as const;
export type DiaperKind = (typeof diaperKinds)[number];

export type DiaperEvent = Readonly<{
  id: string;
  childId: string;
  occurredAtEpochMs: number;
  kind: DiaperKind;
}>;

export type DiaperValidationErrorCode =
  | 'invalid-identity'
  | 'invalid-timestamp'
  | 'invalid-kind';

export class DiaperValidationError extends Error {
  constructor(readonly code: DiaperValidationErrorCode) {
    super('The diaper event is invalid.');
    this.name = 'DiaperValidationError';
  }
}

export function assertDiaperEpochMs(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isFinite(new Date(value).getTime())
  ) throw new DiaperValidationError('invalid-timestamp');
}

export function createDiaperEvent(input: DiaperEvent): DiaperEvent {
  if (input.id.trim().length === 0 || input.childId.trim().length === 0) {
    throw new DiaperValidationError('invalid-identity');
  }
  assertDiaperEpochMs(input.occurredAtEpochMs);
  if (!diaperKinds.includes(input.kind)) {
    throw new DiaperValidationError('invalid-kind');
  }
  return { ...input };
}
