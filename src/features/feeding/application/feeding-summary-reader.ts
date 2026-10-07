import type { EpochRange } from '../../../utils/epoch-range';

export type FeedingSummary = Readonly<{
  dayCount: number;
  latestCompletedAtEpochMs: number | null;
}>;

export interface FeedingSummaryReader {
  getCompletedSummary(childId: string, day: EpochRange): Promise<FeedingSummary>;
}
