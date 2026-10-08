import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { sv } from '../../../i18n/locales/sv';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { getChildAge } from '../../children/domain/age';
import { emptyGrowthDraft } from './growth-form';
import type { GrowthState } from './growth-controller';

const h = vi.hoisted(() => ({
  state: {} as GrowthState, push: vi.fn(), alert: vi.fn(), save: vi.fn(), refresh: vi.fn(),
  loadMore: vi.fn(), checkStatus: vi.fn(), edit: vi.fn(), delete: vi.fn(), prepareDeleteConfirmation: vi.fn(), cancelEdit: vi.fn(), changeDraft: vi.fn(), recover: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()],
}));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'android' }, Alert: { alert: h.alert }, StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: 'DateTimePicker' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: h.push }) }));
const i18n = createInstance();
await i18n.init({ lng: 'sv', resources: { sv: { translation: sv } }, initAsync: false });
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.t }) }));
vi.mock('./use-growth', () => ({ useGrowth: () => ({ state: h.state, controller: h }) }));
vi.mock('../../children/presentation/child-bootstrap-gate', () => ({ useChildBootstrap: () => ({ refreshBootstrap: h.recover }) }));
vi.mock('@/components/ui/app-text', () => import('../../../components/ui/app-text'));
vi.mock('@/components/ui/button', () => import('../../../components/ui/button'));
vi.mock('@/components/ui/card', () => import('../../../components/ui/card'));
vi.mock('@/components/ui/screen', () => import('../../../components/ui/screen'));
vi.mock('@/theme/tokens', () => import('../../../theme/tokens'));
import { GrowthScreen } from './growth-screen';
import { growthPickerDate, growthPickerValue } from './growth-date-field';
type Host = { type: string; props: Record<string, any>; text: string };
function expand(node: React.ReactNode): Host[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (typeof node === 'string' || typeof node === 'number') return [{ type: '#text', props: {}, text: String(node) }];
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, any>>;
  if (typeof element.type === 'function') return expand((element.type as (props: any) => React.ReactNode)(element.props));
  if (element.type === 'Modal' && element.props.visible === false) return [];
  return [{ type: String(element.type), props: element.props, text: '' }, ...expand(element.props.children)];
}
const context = { childId: 'a', selectionVersion: 0, selectionScope: {} };
const date = createCalendarDate('2026-10-08');
const child = { id: 'a', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-01-01') };
const measurement = { id: 'id', childId: 'a', measuredOn: date, weightGrams: 4567, lengthMm: 567,
  headCircumferenceMm: 345, lengthMethod: 'lying' as const, revision: 3 };
function render(mode: 'recording' | 'history' = 'recording') { return expand(GrowthScreen({ mode })); }
function text(nodes: Host[]) { return nodes.map(node => node.text).join(' '); }
function button(nodes: Host[], label: string) {
  return nodes.find(node => node.type === 'Pressable' && text(expand(node.props.children)).trim() === label)!;
}
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.clearAllMocks();
  h.prepareDeleteConfirmation.mockImplementation((measurement: unknown) => () => h.delete(measurement));
  h.state = { status: 'ready', summary: { child, age: getChildAge(child.dateOfBirth, date) },
    snapshot: { child, context, value: { items: [measurement], nextCursor: null } },
    busy: false, refreshing: false, paging: false, pageError: false, feedback: null, pending: null, fields: {},
    draft: emptyGrowthDraft, editing: null, formVersion: 0 };
});

describe('Growth native presentation contracts', () => {
  it('shows the canonical child header, exact age, Swedish unit labels and accessible inputs', () => {
    const nodes = render(); const output = text(nodes);
    for (const label of ['Mio', '9 månader och 7 dagar', 'Mätdatum', 'Vikt (kg)', 'Längd/höjd (cm)', 'Huvudomfång (cm)']) expect(output).toContain(label);
    const inputs = nodes.filter(node => node.type === 'TextInput');
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input.props.accessibilityLabel).toBeTruthy();
      expect(input.props.keyboardType).toBe('decimal-pad');
      expect(input.props.editable).toBe(true);
      expect(JSON.stringify(input.props.style)).toContain('"minHeight":52');
      expect(input.props.numberOfLines).toBeUndefined();
    }
    expect(nodes.find(node => node.type === 'ScrollView')?.props.keyboardShouldPersistTaps).toBe('handled');
  });
  it('provides explicit length methods with no default selection', () => {
    h.state = { ...h.state, draft: { ...emptyGrowthDraft, length: '56,7' } };
    const nodes = render();
    for (const method of ['Liggande', 'Stående', 'Okänt']) expect(button(nodes, method).props.accessibilityState.selected).toBe(false);
    button(nodes, 'Okänt').props.onPress();
    expect(h.changeDraft).toHaveBeenCalledWith({ method: 'unknown' }, context);
  });
  it('shows field-specific Swedish errors without exposing exception internals', () => {
    h.state = { ...h.state, fields: { weight: 'weight', date: 'beforeBirth', measurements: 'measurements' }, feedback: 'failure' };
    const output = text(render());
    expect(output).toContain('högst tre decimaler');
    expect(output).toContain('före barnets födelsedatum');
    expect(output).toContain('Ange minst ett mätvärde');
    expect(output).not.toContain('SQL');
  });
  it('renders exact stored units, methods and distinct same-day sessions', () => {
    h.state = { ...h.state, snapshot: { ...h.state.snapshot!, value: { items: [measurement, { ...measurement, id: 'second', weightGrams: 5000 }], nextCursor: null } } };
    const output = text(render('history'));
    for (const value of ['2026-10-08', '4,567 kg', '56,7 cm', '34,5 cm', 'Liggande', '5 kg']) expect(output).toContain(value);
    expect(output.match(/2026-10-08/g)).toHaveLength(2);
  });
  it('keeps large-font actions full width, wrapping naturally, with accessible touch targets', () => {
    const nodes = render('history');
    const edit = nodes.find(node => node.props.accessibilityLabel === 'Redigera mätningen 2026-10-08')!;
    expect(edit.props.accessibilityRole).toBe('button');
    const style = edit.props.style({ pressed: false });
    expect(JSON.stringify(style)).toContain('"minHeight":48');
    const label = expand(edit.props.children).find(node => node.type === 'Text')!;
    expect(label.props.numberOfLines).toBeUndefined();
    expect(JSON.stringify(label.props.style)).toContain('"alignSelf":"stretch"');
  });
  it('edits with the original measurement and confirms deletion before calling the controller', () => {
    const nodes = render('history');
    button(nodes, 'Redigera').props.onPress();
    expect(h.edit).toHaveBeenCalledWith(measurement);
    button(nodes, 'Ta bort').props.onPress();
    expect(h.delete).not.toHaveBeenCalled();
    expect(h.prepareDeleteConfirmation).toHaveBeenCalledWith(measurement);
    const actions = h.alert.mock.calls[0][2];
    expect(actions[0].style).toBe('cancel'); expect(actions[0].onPress).toBeUndefined();
    expect(actions[1].style).toBe('destructive');
    actions[1].onPress(); expect(h.delete).toHaveBeenCalledWith(measurement);
  });
  it('does not mutate when the delete alert is cancelled', () => {
    button(render('history'), 'Ta bort').props.onPress();
    const cancel = h.alert.mock.calls[0][2][0];
    expect(cancel.style).toBe('cancel');
    cancel.onPress?.();
    expect(h.delete).not.toHaveBeenCalled();
  });
  it('does not open confirmation when the originating context is invalid', () => {
    h.prepareDeleteConfirmation.mockReturnValueOnce(null);
    button(render('history'), 'Ta bort').props.onPress();
    expect(h.alert).not.toHaveBeenCalled();
    expect(h.delete).not.toHaveBeenCalled();
  });
  it('locks all mutation actions during uncertain save and offers only read-only status checking', () => {
    h.state = { ...h.state, pending: { action: 'record', attempt: measurement }, feedback: 'uncertain' };
    const nodes = render();
    expect(button(nodes, 'Spara mätning').props.disabled).toBe(true);
    expect(nodes.filter(node => node.type === 'TextInput').every(node => node.props.editable === false)).toBe(true);
    button(nodes, 'Kontrollera status').props.onPress();
    expect(h.checkStatus).toHaveBeenCalledTimes(1); expect(h.save).not.toHaveBeenCalled();
  });
  it('does not expose an old child payload or permit its check for a different child', () => {
    h.state = { ...h.state, pending: { action: 'record', attempt: { ...measurement, childId: 'b', weightGrams: 1234 } } };
    const nodes = render();
    expect(text(nodes)).toContain('ursprungliga barn');
    expect(text(nodes)).not.toContain('1,234');
    expect(button(nodes, 'Kontrollera status').props.disabled).toBe(true);
  });
  it.each(['loading', 'error', 'missing'] as const)('renders safe %s state with no measurement form', status => {
    h.state = { ...h.state, status, snapshot: null, summary: null };
    const nodes = render();
    expect(nodes.filter(node => node.type === 'TextInput')).toHaveLength(0);
    if (status === 'error') { button(nodes, 'Försök igen').props.onPress(); expect(h.refresh).toHaveBeenCalledTimes(1); }
    if (status === 'missing') { button(nodes, 'Kontrollera barnval').props.onPress(); expect(h.recover).toHaveBeenCalledTimes(1); }
  });
  it('shows empty history and explicit pagination/retry states', () => {
    h.state = { ...h.state, snapshot: { ...h.state.snapshot!, value: { items: [], nextCursor: null } } };
    expect(text(render('history'))).toContain('Inga mätningar sparade ännu');
    h.state = { ...h.state, pageError: true, snapshot: { ...h.state.snapshot!, value: { items: [measurement],
      nextCursor: { childId: 'a', measuredOn: date, id: 'id' } } } };
    const nodes = render('history'); button(nodes, 'Visa fler mätningar').props.onPress();
    expect(h.loadMore).toHaveBeenCalledTimes(1);
    expect(text(nodes)).toContain('Fler mätningar kunde inte läsas');
  });
  it('navigates through the canonical protected Growth routes', () => {
    button(render(), 'Visa tillväxthistorik').props.onPress(); expect(h.push).toHaveBeenLastCalledWith('/growth-history');
    button(render('history'), 'Registrera tillväxt').props.onPress(); expect(h.push).toHaveBeenLastCalledWith('/growth');
  });
  it('shows confirmed success separately when history refresh has failed', () => {
    h.state = { ...h.state, status: 'error', snapshot: null, summary: null, feedback: 'saved' };
    const output = text(render());
    expect(output).toContain('Mätningen är sparad.');
    expect(output).toContain('Tillväxten kunde inte läsas.');
  });
  it.each([true, false])('keeps leap-day calendar dates through picker conversion (Android=%s)', android => {
    const date = createCalendarDate('2024-02-29');
    expect(growthPickerDate(growthPickerValue(date, android), android)).toBe(date);
  });
});
