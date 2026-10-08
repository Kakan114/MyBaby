import type { CalendarDate } from '../../children/domain/calendar-date';
import type { GrowthMeasurement } from '../domain/growth-measurement';

export type GrowthHistoryCursor = Readonly<{ childId: string; measuredOn: CalendarDate; id: string }>;
export type GrowthHistoryPage = Readonly<{
  items: readonly GrowthMeasurement[];
  nextCursor: GrowthHistoryCursor | null;
}>;
export interface GrowthRepository {
  create(measurement: GrowthMeasurement): Promise<void>;
  getById(childId: string, id: string): Promise<GrowthMeasurement | null>;
  listHistory(childId: string, limit: number, before?: GrowthHistoryCursor | null): Promise<GrowthHistoryPage>;
  updateIfMatches(expected: GrowthMeasurement, replacement: GrowthMeasurement): Promise<boolean>;
  deleteIfMatches(expected: GrowthMeasurement): Promise<boolean>;
}
