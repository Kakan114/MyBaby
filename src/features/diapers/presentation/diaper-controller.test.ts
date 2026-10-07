import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiaperRuntime, DiaperRuntimeState } from '@/runtime/app-runtime';
import { DiaperApplicationError } from '../application/diaper';
import type { DiaperEvent, DiaperKind } from '../domain/diaper-event';
import { createDiaperController, DIAPER_SUCCESS_FEEDBACK_MS } from './diaper-controller';

const emptyState: DiaperRuntimeState = { childId: 'child-a', events: [], nowEpochMs: 100 };

function event(kind: DiaperKind = 'wet', id = `event-${kind}`): DiaperEvent {
  return { id, childId: 'child-a', occurredAtEpochMs: 100, kind };
}

function runtimeFixture(overrides: Partial<DiaperRuntime> = {}): DiaperRuntime {
  return {
    getState: vi.fn(async () => emptyState),
    record: vi.fn(async (input) => {
      const recordedEvent = event(input.kind);
      return { state: { ...emptyState, events: [recordedEvent] }, recordedEvent };
    }),
    delete: vi.fn(async () => emptyState),
    update: vi.fn(async ({ expected, kind, occurredAtEpochMs }) => ({
      ...emptyState, events: [{ ...expected, kind, occurredAtEpochMs }],
    })),
    ...overrides,
  };
}

describe('diaper controller', () => {
  afterEach(() => vi.useRealTimers());

  it('loads state and immediately records each fast kind', async () => {
    const runtime = runtimeFixture();
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    for (const kind of ['wet', 'dirty', 'mixed'] as const) {
      await expect(controller.record({ timing: 'now', kind })).resolves.toBe('saved');
      expect(controller.state).toMatchObject({
        feedback: { status: 'saved', event: { kind }, undoFailed: false },
      });
      expect(controller.state).not.toHaveProperty('selectedKind');
    }
    expect(runtime.record).toHaveBeenCalledTimes(3);
  });

  it('offers Undo for the exact most recent fast event and expires it after five seconds', async () => {
    vi.useFakeTimers();
    const runtime = runtimeFixture();
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'dirty' });
    expect(controller.state).toMatchObject({ feedback: { status: 'saved', event: event('dirty') } });
    vi.advanceTimersByTime(DIAPER_SUCCESS_FEEDBACK_MS);
    expect(controller.state).toMatchObject({ feedback: { status: 'idle' } });
    expect(runtime.delete).not.toHaveBeenCalled();
  });

  it('undoes exactly the retained immutable event snapshot without confirmation', async () => {
    const runtime = runtimeFixture();
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'mixed' });
    await expect(controller.undo()).resolves.toBe('success');
    expect(runtime.delete).toHaveBeenCalledOnce();
    expect(runtime.delete).toHaveBeenCalledWith(event('mixed'));
    expect(controller.state).toMatchObject({ feedback: { status: 'notice', kind: 'undone' } });
  });

  it('replaces the previous Undo target after a subsequent successful save', async () => {
    const runtime = runtimeFixture();
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'wet' });
    await controller.record({ timing: 'now', kind: 'dirty' });
    await controller.undo();
    expect(runtime.delete).toHaveBeenCalledWith(event('dirty'));
  });

  it('does not blindly repeat a failed Undo and preserves correction access', async () => {
    const runtime = runtimeFixture({
      delete: vi.fn(async () => { throw new DiaperApplicationError('diaper-delete-not-applied'); }),
    });
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'wet' });
    await expect(controller.undo()).resolves.toBe('not-applied');
    expect(controller.state).toMatchObject({
      feedback: { status: 'saved', event: event('wet'), undoFailed: true },
    });
    expect(runtime.delete).toHaveBeenCalledOnce();
  });

  it('blocks repeated Undo taps synchronously while exact deletion is pending', async () => {
    let resolveDelete!: (value: DiaperRuntimeState) => void;
    const pendingDelete = new Promise<DiaperRuntimeState>((done) => { resolveDelete = done; });
    const runtime = runtimeFixture({ delete: vi.fn(() => pendingDelete) });
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'wet' });
    const first = controller.undo();
    await expect(controller.undo()).resolves.toBe('busy');
    resolveDelete(emptyState);
    await expect(first).resolves.toBe('success');
    expect(runtime.delete).toHaveBeenCalledOnce();
  });

  it('updates and deletes history events through runtime operations', async () => {
    const original = event('wet');
    const runtime = runtimeFixture();
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await expect(controller.updateEvent({
      expected: original, kind: 'mixed', occurredAtEpochMs: 90,
    })).resolves.toBe('success');
    expect(runtime.update).toHaveBeenCalledWith({
      expected: original, kind: 'mixed', occurredAtEpochMs: 90,
    });
    await expect(controller.deleteEvent(original)).resolves.toBe('success');
    expect(runtime.delete).toHaveBeenCalledWith(original);
  });

  it('locks synchronously against duplicate save and mutation taps', async () => {
    let resolveRecord!: (value: Awaited<ReturnType<DiaperRuntime['record']>>) => void;
    const pendingRecord = new Promise<Awaited<ReturnType<DiaperRuntime['record']>>>((done) => {
      resolveRecord = done;
    });
    const runtime = runtimeFixture({ record: vi.fn(() => pendingRecord) });
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    const first = controller.record({ timing: 'now', kind: 'wet' });
    await expect(controller.record({ timing: 'now', kind: 'dirty' })).resolves.toBe('busy');
    await expect(controller.deleteEvent(event())).resolves.toBe('busy');
    resolveRecord({ state: emptyState, recordedEvent: event() });
    await first;
    expect(runtime.record).toHaveBeenCalledOnce();
    expect(runtime.delete).not.toHaveBeenCalled();
  });

  it('keeps confirmed insert absence retryable and uncertain outcome locked', async () => {
    const runtime = runtimeFixture({
      record: vi.fn()
        .mockRejectedValueOnce(new DiaperApplicationError('diaper-not-saved'))
        .mockRejectedValueOnce(new DiaperApplicationError('diaper-outcome-uncertain')),
    });
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await expect(controller.record({ timing: 'now', kind: 'wet' })).resolves.toBe('not-saved');
    await expect(controller.record({ timing: 'now', kind: 'wet' })).resolves.toBe('uncertain');
    expect(controller.state).toMatchObject({ feedback: { status: 'uncertain' } });
    controller.clearFeedback();
    expect(controller.state).toMatchObject({ feedback: { status: 'uncertain' } });
  });

  it('keeps future historical validation editable', async () => {
    const runtime = runtimeFixture({
      record: vi.fn(async () => { throw new DiaperApplicationError('future-diaper'); }),
    });
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await expect(controller.record({
      timing: 'historical', kind: 'wet', occurredAtEpochMs: 101,
    })).resolves.toBe('future');
    expect(controller.state).toMatchObject({
      status: 'ready', busy: false, feedback: { status: 'idle' },
    });
  });

  it('clears old-child feedback and ignores stale previous-child results', async () => {
    let resolve!: (value: DiaperRuntimeState) => void;
    const runtime = runtimeFixture({
      getState: vi.fn()
        .mockResolvedValueOnce(emptyState)
        .mockImplementationOnce(() => new Promise<DiaperRuntimeState>((done) => { resolve = done; }))
        .mockResolvedValueOnce({ ...emptyState, childId: 'child-b' }),
    });
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'wet' });
    const stale = controller.refresh();
    await controller.refresh();
    resolve(emptyState); await stale;
    expect(controller.state).toMatchObject({
      value: { childId: 'child-b' }, feedback: { status: 'idle' },
    });
  });

  it('does not publish an obsolete correction completion after a child refresh', async () => {
    let resolveDelete!: (value: DiaperRuntimeState) => void;
    const runtime = runtimeFixture({
      getState: vi.fn()
        .mockResolvedValueOnce(emptyState)
        .mockResolvedValueOnce({ ...emptyState, childId: 'child-b' }),
      delete: vi.fn(() => new Promise<DiaperRuntimeState>((done) => { resolveDelete = done; })),
    });
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    const stale = controller.deleteEvent(event());
    await controller.refresh();
    resolveDelete(emptyState);
    await expect(stale).resolves.toBe('uncertain');
    expect(controller.state).toMatchObject({
      value: { childId: 'child-b' }, feedback: { status: 'idle' },
    });
  });

  it('cancels feedback and prevents stale updates after unmount', async () => {
    vi.useFakeTimers();
    const runtime = runtimeFixture();
    const listener = vi.fn();
    const controller = createDiaperController(runtime);
    controller.mount(listener); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'wet' });
    controller.unmount();
    expect(controller.state).toMatchObject({ feedback: { status: 'idle' } });
    const calls = listener.mock.calls.length;
    vi.advanceTimersByTime(DIAPER_SUCCESS_FEEDBACK_MS);
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('does not resurrect Undo after navigation blur and focus refresh', async () => {
    const runtime = runtimeFixture();
    const controller = createDiaperController(runtime);
    controller.mount(vi.fn()); await controller.refresh();
    await controller.record({ timing: 'now', kind: 'mixed' });
    expect(controller.state).toMatchObject({ feedback: { status: 'saved' } });
    controller.unmount();
    controller.mount(vi.fn()); await controller.refresh();
    expect(controller.state).toMatchObject({ feedback: { status: 'idle' } });
    await expect(controller.undo()).resolves.toBe('conflict');
    expect(runtime.delete).not.toHaveBeenCalled();
  });
});
