import type { TodayRuntime } from '../runtime/create-today-runtime';
import type { TodaySummary } from '../application/today-summary';

export type TodayState =
  | Readonly<{ status: 'loading' | 'missing' | 'error' }>
  | Readonly<{ status: 'ready'; summary: TodaySummary }>;

export function createTodayController(runtime: TodayRuntime, publish: (state: TodayState) => void) {
  let state: TodayState = { status: 'loading' };
  let active = false;
  let switching = false;
  let generation = 0;
  const update = (next: TodayState) => { state = next; publish(next); };
  async function refresh(initial = false) {
    if (!active || switching) return;
    const request = ++generation;
    if (initial || state.status !== 'ready') update({ status: 'loading' });
    try {
      const result = await runtime.getSummary();
      if (!active || switching || request !== generation) return;
      update(result.status === 'ready'
        ? { status: 'ready', summary: result.summary } : { status: 'missing' });
    } catch {
      if (active && !switching && request === generation) update({ status: 'error' });
    }
  }
  return {
    refresh,
    activate() { active = true; void refresh(); },
    deactivate() { active = false; ++generation; },
    selectionChanged(isSwitching: boolean) {
      switching = isSwitching;
      ++generation;
      // Never preserve a snapshot across an authoritative child selection.
      update({ status: 'loading' });
      if (!switching && active) void refresh(true);
    },
  };
}
