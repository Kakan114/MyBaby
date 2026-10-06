import { describe, expect, it, vi } from 'vitest';

import { sv } from '../../../i18n/locales/sv';

import {
  getTimerDiscardCopyVariant,
  requestTimerDiscardConfirmation,
} from './breastfeeding-timer-discard-confirmation';

const copy = {
  title: 'Avbryt matningen?',
  message: 'Den registrerade tiden tas bort och matningen sparas inte.',
  continueLabel: 'Fortsätt matning',
  discardLabel: 'Avbryt och radera',
} as const;

describe('breastfeeding timer discard confirmation', () => {
  it('selects distinct copy from the canonical session state', () => {
    expect(getTimerDiscardCopyVariant('running')).toBe('active');
    expect(getTimerDiscardCopyVariant('paused')).toBe('active');
    expect(getTimerDiscardCopyVariant('finished')).toBe('finished');

    expect(sv.feeding.timer.discard.confirmation.active).toEqual({
      title: copy.title,
      message: copy.message,
      cancel: copy.continueLabel,
      confirm: copy.discardLabel,
    });
    expect(sv.feeding.timer.discard.confirmation.finished).toEqual({
      title: 'Radera matningen?',
      message: 'Den avslutade matningen tas bort och kommer inte att sparas.',
      cancel: 'Behåll',
      confirm: 'Radera utan att spara',
    });
  });
  it('does not discard when the parent cancels confirmation', () => {
    const discard = vi.fn();
    const showDialog = vi.fn();
    requestTimerDiscardConfirmation(showDialog, copy, discard);

    const [title, message, buttons] = showDialog.mock.calls[0]!;
    expect({ title, message }).toEqual({ title: copy.title, message: copy.message });
    expect(buttons[0]).toEqual({ text: 'Fortsätt matning', style: 'cancel' });
    buttons[0].onPress?.();
    expect(discard).not.toHaveBeenCalled();
  });

  it('only discards through the destructive confirmation action', () => {
    const discard = vi.fn();
    const showDialog = vi.fn();
    requestTimerDiscardConfirmation(showDialog, copy, discard);

    const buttons = showDialog.mock.calls[0]![2];
    expect(buttons[1]).toMatchObject({
      text: 'Avbryt och radera', style: 'destructive',
    });
    buttons[1].onPress?.();
    expect(discard).toHaveBeenCalledOnce();
  });
});
