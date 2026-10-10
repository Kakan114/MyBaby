import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { sv } from '../../../i18n/locales/sv';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { getChildAge } from '../../children/domain/age';
import { milestoneDefinitionIds } from '../domain/milestone-catalog';
import { emptyMilestoneDraft } from './milestone-form';
import type { MilestoneState } from './milestone-controller';

const h = vi.hoisted(() => ({ state: {} as MilestoneState, push: vi.fn(), alert: vi.fn(), save: vi.fn(), refresh: vi.fn(),
  loadMore: vi.fn(), checkStatus: vi.fn(), edit: vi.fn(), remove: vi.fn(), prepareDeleteConfirmation: vi.fn(), cancelEdit: vi.fn(),
  changeDraft: vi.fn(), selectSubject: vi.fn(), recover: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()] }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'android' },
  Alert: { alert: h.alert }, StyleSheet: { create: (value: unknown) => value } }));
vi.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: 'DateTimePicker' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: h.push }) }));
const i18n = createInstance();
await i18n.init({ lng: 'sv', resources: { sv: { translation: sv } }, initAsync: false });
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.t }) }));
vi.mock('./use-milestones', () => ({ useMilestones: () => ({ state: h.state, controller: h }) }));
vi.mock('../../children/presentation/child-bootstrap-gate', () => ({ useChildBootstrap: () => ({ refreshBootstrap: h.recover }) }));
vi.mock('@/components/ui/app-text', () => import('../../../components/ui/app-text'));
vi.mock('@/components/ui/button', () => import('../../../components/ui/button'));
vi.mock('@/components/ui/card', () => import('../../../components/ui/card'));
vi.mock('@/components/ui/screen', () => import('../../../components/ui/screen'));
vi.mock('@/theme/tokens', () => import('../../../theme/tokens'));
import { MilestoneScreen } from './milestone-screen';
import { formatMilestoneDate } from './milestone-format';
import { milestonePickerDate, milestonePickerValue } from './milestone-date-field';
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
function text(nodes: Host[]) { return nodes.map(node => node.text).join(' '); }
function button(nodes: Host[], label: string) { return nodes.find(node => node.type === 'Pressable' && text(expand(node.props.children)).trim() === label)!; }
const date = createCalendarDate('2026-10-08');
const olderDate = createCalendarDate('2026-10-07');
const child = { id: 'a', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-01-01') };
const context = { childId: 'a', selectionVersion: 0, selectionScope: {} };
const first = { id: 'first', childId: 'a', subject: { kind: 'predefined' as const, definitionId: 'social.first-smile' as const }, occurredOn: date, note: 'Ett varmt ögonblick', revision: 1 };
const second = { id: 'second', childId: 'a', subject: { kind: 'custom' as const, title: 'Klappade händer' }, occurredOn: date, note: null, revision: 2 };
function render(mode: 'recording' | 'history' = 'recording') { return expand(MilestoneScreen({ mode })); }
beforeEach(() => {
  vi.stubGlobal('React', React); vi.clearAllMocks();
  h.prepareDeleteConfirmation.mockImplementation((value: unknown) => () => h.remove(value));
  h.state = { status: 'ready', summary: { child, age: getChildAge(child.dateOfBirth, date) },
    snapshot: { child, context, value: { items: [first, second], nextCursor: null } }, draft: emptyMilestoneDraft,
    editing: null, fields: {}, busy: false, refreshing: false, paging: false, pageError: false,
    feedback: null, pending: null, formVersion: 0 };
});

describe('Milestone native presentation contracts', () => {
  it('renders every stable catalog choice once under all five localized categories', () => {
    const output = text(render());
    for (const category of ['Socialt', 'Motorik', 'Kommunikation', 'Mat & vardag', 'Tänder']) expect(output).toContain(category);
    for (const id of milestoneDefinitionIds) expect(output).toContain(i18n.t(`milestones.catalog.${id}`));
    expect(output).not.toMatch(/normal|försenad|förväntad ålder|%/i);
    expect(output).not.toContain('milestones.');
  });
  it('shows canonical child age, supportive safety copy and decorative real icons', () => {
    const nodes = render(); const output = text(nodes);
    expect(output).toContain('Mio'); expect(output).toContain('9 månader och 7 dagar');
    expect(output).toContain('inte en bedömning av barnets utveckling');
    expect(nodes.some(node => node.type === 'SymbolView' && node.props.name.android === 'auto_awesome')).toBe(true);
    expect(nodes.some(node => node.type === 'Image')).toBe(false);
  });
  it('uses accessible selected cards and clears hidden custom state through the controller', () => {
    const nodes = render(); const custom = button(nodes, 'Egen milstolpe');
    expect(custom.props.accessibilityRole).toBe('button'); expect(custom.props.accessibilityState.selected).toBe(false);
    custom.props.onPress(); expect(h.selectSubject).toHaveBeenCalledWith('custom', context);
    button(nodes, 'Första leendet').props.onPress(); expect(h.selectSubject).toHaveBeenCalledWith('social.first-smile', context);
  });
  it('shows custom and note fields with exact native limits only when appropriate', () => {
    h.state = { ...h.state, draft: { ...emptyMilestoneDraft, selection: 'custom' } };
    const inputs = render().filter(node => node.type === 'TextInput');
    expect(inputs.map(input => input.props.maxLength)).toEqual([80, 500]);
    expect(inputs[1].props.multiline).toBe(true); expect(inputs[1].props.textAlignVertical).toBe('top');
  });
  it('requires explicit date and retains calendar dates without timezone conversion', () => {
    expect(text(render())).toContain('Välj datum');
    for (const android of [true, false]) {
      const leap = createCalendarDate('2024-02-29');
      expect(milestonePickerDate(milestonePickerValue(leap, android), android)).toBe(leap);
    }
  });
  it('surfaces field-specific Swedish validation safely', () => {
    h.state = { ...h.state, fields: { subject: 'subject', occurredOn: 'beforeBirth', customTitle: 'customTitle', note: 'note' },
      draft: { ...emptyMilestoneDraft, selection: 'custom' }, feedback: 'failure' };
    const output = text(render());
    for (const value of ['Välj en milstolpe', 'före barnets födelsedatum', 'högst 80 tecken', 'högst 500 tecken']) expect(output).toContain(value);
    expect(output).not.toContain('SQL');
  });
  it('locks all inputs/actions during mutation or uncertain outcome and offers read-only checking', () => {
    h.state = { ...h.state, pending: { action: 'record', attempt: first }, feedback: 'uncertain' };
    const nodes = render();
    expect(button(nodes, 'Spara milstolpe').props.disabled).toBe(true);
    expect(nodes.filter(node => node.type === 'Pressable' && node.props.accessibilityState?.selected !== undefined)
      .every(node => node.props.disabled)).toBe(true);
    button(nodes, 'Kontrollera status').props.onPress(); expect(h.checkStatus).toHaveBeenCalledTimes(1);
  });
  it('renders a grouped same-date timeline without inventing occurrence times', () => {
    const output = text(render('history'));
    expect(output).toContain('Första leendet'); expect(output).toContain('Klappade händer');
    expect(output.match(/8 oktober 2026/g)).toHaveLength(1);
    expect(output).toContain('Ett varmt ögonblick'); expect(output).not.toMatch(/\d\d:\d\d/);
  });
  it('renders different-date groups newest first and formats CalendarDate in Swedish', () => {
    h.state = { ...h.state, snapshot: { ...h.state.snapshot!, value: { items: [first, { ...second, occurredOn: olderDate }], nextCursor: null } } };
    const output = text(render('history'));
    expect(output.indexOf(formatMilestoneDate(date))).toBeLessThan(output.indexOf(formatMilestoneDate(olderDate)));
  });
  it('edits the exact snapshot and requires destructive confirmation for deletion', () => {
    const nodes = render('history'); button(nodes, 'Redigera').props.onPress(); expect(h.edit).toHaveBeenCalledWith(first);
    button(nodes, 'Ta bort').props.onPress(); expect(h.remove).not.toHaveBeenCalled();
    const actions = h.alert.mock.calls[0][2]; expect(actions[0].style).toBe('cancel'); expect(actions[1].style).toBe('destructive');
    actions[1].onPress(); expect(h.remove).toHaveBeenCalledWith(first);
  });
  it('cancels deletion without mutating and provides accessible full-size actions', () => {
    const nodes = render('history'); const remove = button(nodes, 'Ta bort');
    expect(remove.props.accessibilityLabel).toBe('Ta bort Första leendet');
    expect(JSON.stringify(remove.props.style({ pressed: false }))).toContain('"minHeight":48');
    remove.props.onPress(); const cancel = h.alert.mock.calls[0][2][0]; cancel.onPress?.();
    expect(h.remove).not.toHaveBeenCalled();
  });
  it('does not open a destructive dialog for a stale context', () => {
    h.prepareDeleteConfirmation.mockReturnValueOnce(null);
    button(render('history'), 'Ta bort').props.onPress(); expect(h.alert).not.toHaveBeenCalled();
  });
  it('shows pagination, empty, read error and missing-child recovery states', () => {
    h.state = { ...h.state, snapshot: { ...h.state.snapshot!, value: { items: [first], nextCursor: { childId: 'a', occurredOn: date, id: 'first' } } } };
    button(render('history'), 'Visa fler milstolpar').props.onPress(); expect(h.loadMore).toHaveBeenCalledTimes(1);
    h.state = { ...h.state, snapshot: { ...h.state.snapshot!, value: { items: [], nextCursor: null } } };
    expect(text(render('history'))).toContain('Inga milstolpar sparade ännu');
    h.state = { ...h.state, status: 'error', snapshot: null, summary: null }; button(render(), 'Försök igen').props.onPress(); expect(h.refresh).toHaveBeenCalled();
    h.state = { ...h.state, status: 'missing', snapshot: null, summary: null }; button(render(), 'Kontrollera barnval').props.onPress(); expect(h.recover).toHaveBeenCalled();
  });
  it('uses the protected recording/history routes consistently', () => {
    button(render(), 'Visa milstolpar').props.onPress(); expect(h.push).toHaveBeenLastCalledWith('/milestone-history');
    button(render('history'), 'Registrera milstolpe').props.onPress(); expect(h.push).toHaveBeenLastCalledWith('/milestones');
  });
});
