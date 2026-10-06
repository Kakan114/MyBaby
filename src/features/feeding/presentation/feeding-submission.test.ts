import { describe, expect, it, vi } from 'vitest';

import { FeedingValidationError, type FeedingEvent } from '../domain/feeding-event';
import { createFeedingSubmissionController } from './feeding-submission';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

const details = {
  kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
} as const;
const event: FeedingEvent = {
  ...details, id: 'feeding-1', childId: 'child-1', occurredAtEpochMs: 123,
};

function fixture(recordFeeding = vi.fn(async () => event)) {
  const states: unknown[] = [];
  const onConfirmed = vi.fn();
  const controller = createFeedingSubmissionController({
    runtime: { recordFeeding },
    onStateChange: (state) => states.push(state),
    onConfirmed,
  });
  return { controller, onConfirmed, recordFeeding, states };
}

describe('feeding submission lifecycle', () => {
  it('prevents duplicate submissions synchronously and confirms one save', async () => {
    const pending = deferred<FeedingEvent>();
    const test = fixture(vi.fn(() => pending.promise));

    const first = test.controller.submit(() => details);
    test.controller.dismissConfirmedSuccess();
    const duplicate = test.controller.submit(() => details);
    expect(test.recordFeeding).toHaveBeenCalledOnce();
    pending.resolve(event);
    await Promise.all([first, duplicate]);

    expect(test.states).toEqual([{ status: 'saving' }, { status: 'success' }]);
    expect(test.onConfirmed).toHaveBeenCalledOnce();
  });

  it('returns domain validation failures to editable state', async () => {
    const test = fixture();
    await test.controller.submit(() => {
      throw new FeedingValidationError('invalid-duration');
    });

    expect(test.recordFeeding).not.toHaveBeenCalled();
    expect(test.states.at(-1)).toEqual({ status: 'editing', validation: 'duration' });
    await test.controller.submit(() => details);
    expect(test.recordFeeding).toHaveBeenCalledOnce();
  });

  it('locks an uncertain persistence failure instead of blindly writing again', async () => {
    const recordFeeding = vi.fn().mockRejectedValue(new Error('raw SQLite/path/key'));
    const test = fixture(recordFeeding);

    await test.controller.submit(() => details);
    test.controller.dismissConfirmedSuccess();
    test.controller.startAnother();
    await test.controller.submit(() => details);

    expect(recordFeeding).toHaveBeenCalledOnce();
    expect(test.states.at(-1)).toEqual({ status: 'uncertain' });
    expect(JSON.stringify(test.states)).not.toContain('SQLite');
  });

  it('does not update presentation state after unmount', async () => {
    const pending = deferred<FeedingEvent>();
    const test = fixture(vi.fn(() => pending.promise));
    const operation = test.controller.submit(() => details);
    test.controller.dispose();
    pending.resolve(event);
    await operation;

    expect(test.states).toEqual([{ status: 'saving' }]);
    expect(test.onConfirmed).not.toHaveBeenCalled();
  });

  it('only unlocks a new submission after confirmed success', async () => {
    const test = fixture();
    await test.controller.submit(() => details);
    test.controller.startAnother();
    await test.controller.submit(() => details);
    expect(test.recordFeeding).toHaveBeenCalledTimes(2);
  });

  it('clears confirmed success without another write before leaving for history', async () => {
    const test = fixture();
    await test.controller.submit(() => details);

    test.controller.startAnother();

    expect(test.states.at(-1)).toEqual({ status: 'editing' });
    expect(test.recordFeeding).toHaveBeenCalledOnce();
  });
});
