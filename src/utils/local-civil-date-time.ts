export type CivilDate = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

export type CivilTime = Readonly<{
  hour: number;
  minute: number;
}>;

export type CivilDateTime = CivilDate & CivilTime;

export type LocalCivilResolution =
  | Readonly<{ status: 'nonexistent' }>
  | Readonly<{ status: 'unique'; epochMs: number }>
  | Readonly<{ status: 'ambiguous'; epochMs: readonly [number, number] }>;

export function assertCivilDate(value: CivilDate): void {
  const candidate = new Date(Date.UTC(value.year, value.month - 1, value.day));
  if (
    !Number.isInteger(value.year) ||
    !Number.isInteger(value.month) ||
    !Number.isInteger(value.day) ||
    candidate.getUTCFullYear() !== value.year ||
    candidate.getUTCMonth() + 1 !== value.month ||
    candidate.getUTCDate() !== value.day
  ) throw new Error('Invalid civil date.');
}

function assertCivilTime(value: CivilTime): void {
  if (
    !Number.isInteger(value.hour) || value.hour < 0 || value.hour > 23 ||
    !Number.isInteger(value.minute) || value.minute < 0 || value.minute > 59
  ) throw new Error('Invalid civil time.');
}

export function createAndroidDatePickerValue(value: CivilDate): Date {
  assertCivilDate(value);
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}

export function civilDateFromAndroidDatePicker(date: Date): CivilDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function civilDateFromLocalPicker(date: Date): CivilDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function civilTimeFromLocalPicker(date: Date): CivilTime {
  return { hour: date.getHours(), minute: date.getMinutes() };
}

export function createLocalPickerValue(
  date: CivilDate,
  time: CivilTime = { hour: 12, minute: 0 },
): Date {
  assertCivilDate(date);
  assertCivilTime(time);
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
}

function matchesLocal(value: Date, civil: CivilDateTime): boolean {
  return value.getFullYear() === civil.year &&
    value.getMonth() + 1 === civil.month &&
    value.getDate() === civil.day &&
    value.getHours() === civil.hour &&
    value.getMinutes() === civil.minute &&
    value.getSeconds() === 0 && value.getMilliseconds() === 0;
}

export function resolveLocalCivilDateTime(civil: CivilDateTime): LocalCivilResolution {
  assertCivilDate(civil);
  assertCivilTime(civil);
  const nominalUtc = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute);
  const matches: number[] = [];
  for (let deltaMinutes = -15 * 60; deltaMinutes <= 15 * 60; deltaMinutes += 1) {
    const epochMs = nominalUtc + deltaMinutes * 60_000;
    if (matchesLocal(new Date(epochMs), civil)) matches.push(epochMs);
  }
  if (matches.length === 0) return { status: 'nonexistent' };
  matches.sort((left, right) => left - right);
  if (matches.length === 1) return { status: 'unique', epochMs: matches[0]! };
  return { status: 'ambiguous', epochMs: [matches[0]!, matches[matches.length - 1]!] };
}

export function chooseLocalCivilInstant(
  civil: CivilDateTime,
  occurrence: 0 | 1 | null,
): Readonly<{ status: 'valid'; epochMs: number }> |
  Readonly<{ status: 'nonexistent' }> |
  Readonly<{ status: 'ambiguous' }> {
  const resolution = resolveLocalCivilDateTime(civil);
  if (resolution.status !== 'ambiguous') {
    return resolution.status === 'unique'
      ? { status: 'valid', epochMs: resolution.epochMs }
      : resolution;
  }
  return occurrence === null
    ? { status: 'ambiguous' }
    : { status: 'valid', epochMs: resolution.epochMs[occurrence] };
}
