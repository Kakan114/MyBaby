import { createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';
import { createGrowthMeasurement, type GrowthMeasurement } from '../domain/growth-measurement';
import type { GrowthHistoryCursor, GrowthHistoryPage, GrowthRepository } from '../application/growth-repository';

type BindValue = string | number | null;
export interface GrowthDatabase {
  getFirstAsync<T>(sql: string, params: BindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: BindValue[]): Promise<T[]>;
  runAsync(sql: string, params: BindValue[]): Promise<Readonly<{ changes: number }>>;
}
type GrowthRow = {
  id: unknown; child_id: unknown; measured_on: unknown; weight_grams: unknown;
  length_mm: unknown; head_circumference_mm: unknown; length_method: unknown; revision: unknown;
};
const columns = 'id, child_id, measured_on, weight_grams, length_mm, head_circumference_mm, length_method, revision';
function identity(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Invalid Growth identity.');
}
function mapRow(row: GrowthRow, childId: string): GrowthMeasurement {
  if (typeof row.id !== 'string' || typeof row.child_id !== 'string' || row.child_id !== childId ||
      typeof row.measured_on !== 'string' || typeof row.revision !== 'number' ||
      ![row.weight_grams, row.length_mm, row.head_circumference_mm].every(value => value === null || typeof value === 'number') ||
      !(row.length_method === null || typeof row.length_method === 'string')) {
    throw new Error('Invalid persisted Growth row.');
  }
  return createGrowthMeasurement({
    id: row.id, childId: row.child_id, measuredOn: row.measured_on as CalendarDate,
    weightGrams: row.weight_grams as number | null, lengthMm: row.length_mm as number | null,
    headCircumferenceMm: row.head_circumference_mm as number | null,
    lengthMethod: row.length_method as GrowthMeasurement['lengthMethod'], revision: row.revision,
  });
}
function values(value: GrowthMeasurement): BindValue[] {
  return [value.id, value.childId, value.measuredOn, value.weightGrams, value.lengthMm,
    value.headCircumferenceMm, value.lengthMethod, value.revision];
}

/** Uses the caller's connection; serialization and uncertain outcomes belong to runtime/application. */
export class SqliteGrowthRepository implements GrowthRepository {
  constructor(private readonly database: GrowthDatabase) {}
  async create(input: GrowthMeasurement): Promise<void> {
    const value = createGrowthMeasurement(input);
    if (value.revision !== 1) throw new Error('New Growth sessions require revision 1.');
    await this.database.runAsync(`INSERT INTO growth_measurements (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`, values(value));
  }
  async getById(childId: string, id: string): Promise<GrowthMeasurement | null> {
    identity(childId); identity(id);
    const row = await this.database.getFirstAsync<GrowthRow>(
      `SELECT ${columns} FROM growth_measurements WHERE child_id = ? AND id = ?;`, [childId, id]);
    return row === null ? null : mapRow(row, childId);
  }
  async listHistory(childId: string, limit: number, before: GrowthHistoryCursor | null = null): Promise<GrowthHistoryPage> {
    identity(childId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid Growth page size.');
    const params: BindValue[] = [childId];
    let boundary = '';
    if (before !== null) {
      identity(before.id);
      if (before.childId !== childId) throw new Error('Growth cursor ownership mismatch.');
      const date = createCalendarDate(before.measuredOn);
      boundary = ' AND (measured_on < ? OR (measured_on = ? AND id < ?))';
      params.push(date, date, before.id);
    }
    params.push(limit + 1);
    const rows = await this.database.getAllAsync<GrowthRow>(
      `SELECT ${columns} FROM growth_measurements WHERE child_id = ?${boundary} ORDER BY measured_on DESC, id DESC LIMIT ?;`, params);
    const mapped = rows.map(row => mapRow(row, childId));
    const items = mapped.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: mapped.length > limit && last ? { childId, measuredOn: last.measuredOn, id: last.id } : null,
    };
  }
  async updateIfMatches(expectedInput: GrowthMeasurement, replacementInput: GrowthMeasurement): Promise<boolean> {
    const expected = createGrowthMeasurement(expectedInput);
    const replacement = createGrowthMeasurement(replacementInput);
    if (replacement.id !== expected.id || replacement.childId !== expected.childId ||
        replacement.revision !== expected.revision + 1) throw new Error('Invalid Growth replacement identity or revision.');
    const result = await this.database.runAsync(`UPDATE growth_measurements
      SET measured_on = ?, weight_grams = ?, length_mm = ?, head_circumference_mm = ?, length_method = ?, revision = ?
      WHERE child_id = ? AND id = ? AND revision = ?;`,
    [replacement.measuredOn, replacement.weightGrams, replacement.lengthMm, replacement.headCircumferenceMm,
      replacement.lengthMethod, replacement.revision, expected.childId, expected.id, expected.revision]);
    return result.changes === 1;
  }
  async deleteIfMatches(input: GrowthMeasurement): Promise<boolean> {
    const expected = createGrowthMeasurement(input);
    const result = await this.database.runAsync(
      'DELETE FROM growth_measurements WHERE child_id = ? AND id = ? AND revision = ?;',
      [expected.childId, expected.id, expected.revision]);
    return result.changes === 1;
  }
}
