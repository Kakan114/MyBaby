import type { EpochRange } from '../../../utils/epoch-range';

export type DiaperSummary = Readonly<{
  dayCount: number;
  latestOccurredAtEpochMs: number | null;
}>;

export interface DiaperSummaryReader {
  getEventSummary(childId: string, day: EpochRange): Promise<DiaperSummary>;
}
