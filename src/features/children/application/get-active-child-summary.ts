import { getChildAge, type ChildAge } from '../domain/age';
import type { CalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';
import { getActiveChild, type ActiveChildDependencies } from './active-child';

export type ActiveChildSummary = Readonly<{
  child: Child;
  age: ChildAge;
}>;

export async function getActiveChildSummary(
  dependencies: ActiveChildDependencies,
  asOf: CalendarDate,
): Promise<ActiveChildSummary | null> {
  const child = await getActiveChild(dependencies);
  return child === null
    ? null
    : { child, age: getChildAge(child.dateOfBirth, asOf) };
}
