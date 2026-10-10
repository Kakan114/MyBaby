import { describe, expect, it } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { milestoneDefinitionIds } from '../domain/milestone-catalog';
import { createMilestoneEntry } from '../domain/milestone-entry';
import { emptyMilestoneDraft, milestoneDraftFromEntry, parseMilestoneDraft } from './milestone-form';

describe('Milestone form', () => {
  const date = createCalendarDate('2024-02-29');
  it('requires a deliberate subject and occurrence date', () => {
    expect(parseMilestoneDraft(emptyMilestoneDraft).errors).toEqual({ subject: 'subject', occurredOn: 'date' });
  });
  it.each(milestoneDefinitionIds)('uses stable catalog subject %s', definitionId => {
    expect(parseMilestoneDraft({ ...emptyMilestoneDraft, selection: definitionId, occurredOn: date }).values).toEqual({
      subject: { kind: 'predefined', definitionId }, occurredOn: date, note: null,
    });
  });
  it('trims a custom title and optional note through domain normalization', () => {
    expect(parseMilestoneDraft({ selection: 'custom', customTitle: '  Klappar händer  ', occurredOn: date, note: '  Fint minne  ' }).values)
      .toEqual({ subject: { kind: 'custom', title: 'Klappar händer' }, occurredOn: date, note: 'Fint minne' });
  });
  it('rejects empty and overlong custom titles at exact boundaries', () => {
    expect(parseMilestoneDraft({ ...emptyMilestoneDraft, selection: 'custom', occurredOn: date }).errors.customTitle).toBe('customTitle');
    expect(parseMilestoneDraft({ selection: 'custom', customTitle: 'å'.repeat(80), occurredOn: date, note: '' }).values).not.toBeNull();
    expect(parseMilestoneDraft({ selection: 'custom', customTitle: 'å'.repeat(81), occurredOn: date, note: '' }).errors.customTitle).toBe('customTitle');
  });
  it('normalizes an empty note and rejects notes over 500 characters', () => {
    expect(parseMilestoneDraft({ selection: 'social.first-smile', customTitle: '', occurredOn: date, note: '  ' }).values?.note).toBeNull();
    expect(parseMilestoneDraft({ selection: 'social.first-smile', customTitle: '', occurredOn: date, note: 'x'.repeat(500) }).values?.note).toHaveLength(500);
    expect(parseMilestoneDraft({ selection: 'social.first-smile', customTitle: '', occurredOn: date, note: 'x'.repeat(501) }).errors.note).toBe('note');
  });
  it('round trips predefined and custom entries into editable drafts', () => {
    const predefined = createMilestoneEntry({ id: 'p', childId: 'a', subject: { kind: 'predefined', definitionId: 'motor.crawls' }, occurredOn: date, note: null, revision: 2 });
    const custom = createMilestoneEntry({ id: 'c', childId: 'a', subject: { kind: 'custom', title: 'Klappade händer' }, occurredOn: date, note: 'Minnet', revision: 3 });
    expect(milestoneDraftFromEntry(predefined)).toEqual({ selection: 'motor.crawls', customTitle: '', occurredOn: date, note: '' });
    expect(milestoneDraftFromEntry(custom)).toEqual({ selection: 'custom', customTitle: 'Klappade händer', occurredOn: date, note: 'Minnet' });
  });
});
