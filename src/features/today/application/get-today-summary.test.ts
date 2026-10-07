import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { ActiveChildDependencies } from '../../children/application/active-child';
import { getTodaySummary, type TodayReadRepositories } from './get-today-summary';
import type { LocalDayContext } from './today-summary';

const day: LocalDayContext = {
  calendarDate: createCalendarDate('2026-10-07'), timeZone: 'UTC',
  startEpochMs: Date.parse('2026-10-07T00:00:00Z'),
  endEpochMs: Date.parse('2026-10-08T00:00:00Z'),
};
const now = day.startEpochMs + 3_600_000;
const child = { id: 'child', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-10-06') };
function fixture() {
  const repositories: ActiveChildDependencies & TodayReadRepositories = {
    activeChildRepository: {
      getActiveChildId: vi.fn(async () => child.id),
      setActiveChildId: vi.fn(), setActiveChildIdIfUnset: vi.fn(), clearActiveChildIdIfMatches: vi.fn(),
    },
    childRepository: {
      getById: vi.fn(async () => child), hasChildren: vi.fn(),
      listChildren: vi.fn(), save: vi.fn(),
    },
    feeding: { getCompletedSummary: vi.fn(async () => ({ dayCount: 0, latestCompletedAtEpochMs: null })) },
    diapers: { getEventSummary: vi.fn(async () => ({ dayCount: 0, latestOccurredAtEpochMs: null })) },
    sleep: {
      listCompletedOverlapping: vi.fn(async () => []),
      getActiveByChildId: vi.fn(async () => null),
    },
  };
  return repositories;
}

describe('Today application summary', () => {
  it('returns precise calendar age and canonical empty states with one resolved identity', async () => {
    const repos = fixture();
    const result = await getTodaySummary(repos, now, day);
    expect(result).toMatchObject({
      status: 'ready',
      summary: {
        child, age: { fullDays: 1 }, capturedAtEpochMs: now, day,
        feeding: { dayCount: 0, latestCompletedAtEpochMs: null },
        diapers: { dayCount: 0, latestOccurredAtEpochMs: null },
        sleep: { completedDurationMs: 0, active: null },
      },
    });
    expect(repos.activeChildRepository.getActiveChildId).toHaveBeenCalledOnce();
    expect(repos.feeding.getCompletedSummary).toHaveBeenCalledWith(child.id, day);
    expect(repos.diapers.getEventSummary).toHaveBeenCalledWith(child.id, day);
    expect(repos.sleep.listCompletedOverlapping).toHaveBeenCalledWith(child.id, day);
  });

  it('returns missing without interpreting it as onboarding or reading feature data', async () => {
    const repos = fixture();
    vi.mocked(repos.activeChildRepository.getActiveChildId).mockResolvedValue(null);
    expect(await getTodaySummary(repos, now, day)).toEqual({ status: 'missing-active-child' });
    expect(repos.childRepository.hasChildren).not.toHaveBeenCalled();
    expect(repos.feeding.getCompletedSummary).not.toHaveBeenCalled();
  });

  it('preserves conditional stale-selection recovery', async () => {
    const repos = fixture();
    vi.mocked(repos.childRepository.getById).mockResolvedValue(null);
    expect(await getTodaySummary(repos, now, day)).toEqual({ status: 'missing-active-child' });
    expect(repos.activeChildRepository.clearActiveChildIdIfMatches).toHaveBeenCalledWith(child.id);
  });

  it('represents active sleep separately and safely handles a backward clock', async () => {
    const repos = fixture();
    const session = { id: 'active', childId: child.id, startedAtEpochMs: now + 1 };
    vi.mocked(repos.sleep.getActiveByChildId).mockResolvedValue(session);
    expect(await getTodaySummary(repos, now, day)).toMatchObject({
      summary: { sleep: { completedDurationMs: 0, active: {
        session, elapsedMs: 0, clockMovedBackward: true,
      } } },
    });
  });

  it('rejects sleep data belonging to another child', async () => {
    const repos = fixture();
    vi.mocked(repos.sleep.getActiveByChildId).mockResolvedValue({
      id: 'wrong', childId: 'other', startedAtEpochMs: now,
    });
    await expect(getTodaySummary(repos, now, day)).rejects.toThrow();
  });

  it('does not convert a failed read into empty data or continue reading', async () => {
    const repos = fixture();
    vi.mocked(repos.feeding.getCompletedSummary).mockRejectedValue(new Error('private'));
    await expect(getTodaySummary(repos, now, day)).rejects.toThrow();
    expect(repos.diapers.getEventSummary).not.toHaveBeenCalled();
  });

  it('rejects a calendar date before birth and invalid captured time', async () => {
    await expect(getTodaySummary(fixture(), now, {
      ...day, calendarDate: createCalendarDate('2026-10-05'),
    })).rejects.toThrow(RangeError);
    await expect(getTodaySummary(fixture(), day.endEpochMs, day)).rejects.toThrow(RangeError);
  });
});
