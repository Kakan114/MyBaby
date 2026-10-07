import type { EpochRange } from '../../../utils/epoch-range';
import type { SleepEvent } from '../domain/sleep';
import type { SleepRepository } from './sleep-repository';

export interface SleepDayReader extends Pick<SleepRepository, 'getActiveByChildId'> {
  listCompletedOverlapping(childId: string, day: EpochRange): Promise<readonly SleepEvent[]>;
}
