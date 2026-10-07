export type EventStatisticsRow = { day_count: unknown; latest_epoch_ms: unknown };

export function readEventStatistics(row: EventStatisticsRow | undefined): Readonly<{
  dayCount: number;
  latestEpochMs: number | null;
}> {
  if (!row || typeof row.day_count !== 'number' ||
      !Number.isSafeInteger(row.day_count) || row.day_count < 0 ||
      (row.latest_epoch_ms !== null && (typeof row.latest_epoch_ms !== 'number' ||
        !Number.isSafeInteger(row.latest_epoch_ms) || row.latest_epoch_ms < 0 ||
        row.latest_epoch_ms > 8_640_000_000_000_000))) {
    throw new Error('Invalid persisted event statistics.');
  }
  return { dayCount: row.day_count, latestEpochMs: row.latest_epoch_ms as number | null };
}
