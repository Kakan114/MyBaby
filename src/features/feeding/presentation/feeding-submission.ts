import type { FeedingRuntime } from '@/runtime/app-runtime';

import {
  FeedingValidationError,
  type FeedingDetails,
} from '../domain/feeding-event';

export type FeedingFormValidationCode = 'amount' | 'duration';

export type FeedingSubmissionState =
  | Readonly<{ status: 'editing'; validation?: FeedingFormValidationCode }>
  | Readonly<{ status: 'saving' }>
  | Readonly<{ status: 'success' }>
  | Readonly<{ status: 'uncertain' }>;

type FeedingSubmissionControllerOptions = Readonly<{
  runtime: Pick<FeedingRuntime, 'recordFeeding'>;
  onStateChange(state: FeedingSubmissionState): void;
  onConfirmed(): void;
}>;

export function createFeedingSubmissionController(
  options: FeedingSubmissionControllerOptions,
) {
  let locked = false;
  let mounted = true;
  let state: FeedingSubmissionState = { status: 'editing' };

  function setState(next: FeedingSubmissionState) {
    state = next;
    if (mounted) {
      options.onStateChange(next);
    }
  }

  function dismissConfirmedSuccess() {
    if (!mounted || state.status !== 'success') {
      return;
    }

    locked = false;
    setState({ status: 'editing' });
  }

  return {
    async submit(createDetails: () => FeedingDetails): Promise<void> {
      if (!mounted || locked) {
        return;
      }

      locked = true;
      setState({ status: 'saving' });

      try {
        const details = createDetails();
        await options.runtime.recordFeeding(details);
        if (mounted) {
          options.onConfirmed();
          setState({ status: 'success' });
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        if (
          error instanceof FeedingValidationError &&
          (error.code === 'invalid-amount' || error.code === 'invalid-duration')
        ) {
          locked = false;
          setState({
            status: 'editing',
            validation: error.code === 'invalid-amount' ? 'amount' : 'duration',
          });
          return;
        }

        // A failed write has an uncertain outcome. Do not submit it again blindly.
        setState({ status: 'uncertain' });
      }
    },

    dismissConfirmedSuccess,
    startAnother: dismissConfirmedSuccess,

    clearValidation() {
      if (mounted && state.status === 'editing' && state.validation !== undefined) {
        setState({ status: 'editing' });
      }
    },

    dispose() {
      mounted = false;
    },
  };
}

export type FeedingSubmissionController = ReturnType<
  typeof createFeedingSubmissionController
>;
