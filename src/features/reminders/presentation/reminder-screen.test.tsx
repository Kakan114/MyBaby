import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { sv } from '../../../i18n/locales/sv';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { emptyReminderDraft } from './reminder-form';
import type { ReminderState } from './reminder-controller';

const h = vi.hoisted(() => ({ state: {} as ReminderState, push: vi.fn(), alert: vi.fn(), save: vi.fn(),
  refresh: vi.fn(), loadMore: vi.fn(), checkStatus: vi.fn(), changeDraft: vi.fn(), edit: vi.fn(),
  cancelEdit: vi.fn(), prepareDeleteConfirmation: vi.fn(), requestNotifications: vi.fn(), remove: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()] }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
  Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'android' }, Alert: { alert: h.alert }, StyleSheet: { create: (value: unknown) => value } }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: 'DateTimePicker' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: h.push }) }));
const i18n = createInstance();
await i18n.init({ lng: 'sv', resources: { sv: { translation: sv } }, initAsync: false });
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.t }) }));
vi.mock('./use-reminders', () => ({ useReminders: () => ({ state: h.state, controller: h }) }));
vi.mock('@/components/ui/app-text', () => import('../../../components/ui/app-text'));
vi.mock('@/components/ui/button', () => import('../../../components/ui/button'));
vi.mock('@/components/ui/card', () => import('../../../components/ui/card'));
vi.mock('@/components/ui/screen', () => import('../../../components/ui/screen'));
vi.mock('@/theme/tokens', () => import('../../../theme/tokens'));
import { ReminderScreen } from './reminder-screen';

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
const text = (nodes: Host[]) => nodes.map(node => node.text).join(' ');
const button = (nodes: Host[], label: string) => nodes.find(node => node.type === 'Pressable' && text(expand(node.props.children)).trim() === label)!;
const child = { id: 'a', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-01-01') };
const context = { childId: 'a', selectionVersion: 0, selectionScope: {} };
const reminder = { id: 'r1', childId: 'a', title: 'BVC', scheduledAtEpochMs: new Date(2026, 9, 12, 10, 30).getTime(), revision: 1 };
const page = { context, child, value: { items: [reminder], nextCursor: null } };
beforeEach(() => {
  vi.stubGlobal('React', React); vi.clearAllMocks();
  h.prepareDeleteConfirmation.mockImplementation((value: unknown) => () => h.remove(value));
  h.state = { status: 'ready', upcoming: page, past: { ...page, value: { items: [reminder], nextCursor: null } },
    draft: emptyReminderDraft, editing: null, fields: {}, busy: false, refreshing: false,
    paging: null, pageError: null, feedback: null, pending: null, formVersion: 0,
    notificationPermission: 'undetermined', notificationReconciliation: null, notificationBusy: false };
});

describe('Reminder native presentation contracts', () => {
  it('shows the active child, explicit form, upcoming data and no raw translation keys', () => {
    const output = text(expand(ReminderScreen({ mode: 'upcoming' })));
    for (const value of ['Påminnelser', 'För Mio', 'Ny påminnelse', 'BVC', 'Aktivera notifikationer']) expect(output).toContain(value);
    expect(output).not.toContain('reminders.');
  });

  it('requests permission only from the explicit action and explains denied status safely', () => {
    expect(h.requestNotifications).not.toHaveBeenCalled();
    button(expand(ReminderScreen({ mode: 'upcoming' })), 'Aktivera notifikationer').props.onPress();
    expect(h.requestNotifications).toHaveBeenCalledOnce();
    h.state = { ...h.state, notificationPermission: 'denied' };
    expect(text(expand(ReminderScreen({ mode: 'upcoming' })))).toContain('Påminnelser sparas ändå');
  });

  it('shows degraded synchronization without claiming per-reminder delivery', () => {
    h.state = { ...h.state, notificationPermission: 'authorized', notificationReconciliation: {
      status: 'degraded', permission: 'authorized', desiredCount: 1, scheduledCount: 0,
    } };
    const output = text(expand(ReminderScreen({ mode: 'upcoming' })));
    expect(output).toContain('kunde inte synkroniseras fullständigt');
    expect(output).not.toMatch(/BVC (är|har blivit) (levererad|schemalagd|sedd)/);
  });

  it('uses protected route navigation and keeps past items read-only except deletion', () => {
    const upcoming = expand(ReminderScreen({ mode: 'upcoming' }));
    button(upcoming, 'Visa tidigare påminnelser').props.onPress();
    expect(h.push).toHaveBeenCalledWith('/reminder-history');
    const past = expand(ReminderScreen({ mode: 'past' }));
    expect(button(past, 'Redigera')).toBeUndefined();
    button(past, 'Ta bort').props.onPress();
    expect(h.remove).not.toHaveBeenCalled();
    h.alert.mock.calls[0][2][1].onPress();
    expect(h.remove).toHaveBeenCalledWith(reminder);
  });
});
