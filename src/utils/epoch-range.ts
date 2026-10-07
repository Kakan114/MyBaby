export type EpochRange = Readonly<{ startEpochMs: number; endEpochMs: number }>;

export function assertEpochRange(range: EpochRange): void {
  if (!Number.isSafeInteger(range.startEpochMs) || range.startEpochMs < 0 ||
      !Number.isSafeInteger(range.endEpochMs) ||
      range.endEpochMs > 8_640_000_000_000_000 ||
      range.endEpochMs <= range.startEpochMs) {
    throw new RangeError('Invalid epoch range.');
  }
}
