import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, radii, shadows, spacing, typography } from '@/theme/tokens';
import {
  civilDateFromAndroidDatePicker,
  civilDateFromLocalPicker,
  civilTimeFromLocalPicker,
  createAndroidDatePickerValue,
  createLocalPickerValue,
  type CivilDate,
  type CivilTime,
} from '../../../utils/local-civil-date-time';
import type { Reminder } from '../domain/reminder';
import { formatReminderDateTime } from './reminder-format';
import { reminderDraftResolution } from './reminder-form';
import type { ReminderController, ReminderState } from './reminder-controller';
import { useReminders } from './use-reminders';

type PickerField = 'date' | 'time';

function formatDate(value: CivilDate): string {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(value.year, value.month - 1, value.day, 12));
}
function formatTime(value: CivilTime): string {
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}

function ReminderForm({ controller, state }: Readonly<{ controller: ReminderController; state: ReminderState }>) {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<PickerField | null>(null);
  const [pickerValue, setPickerValue] = useState(() => new Date());
  if (state.upcoming === null) return null;
  const context = state.upcoming.context;
  const disabled = state.busy || state.pending !== null;
  const resolution = reminderDraftResolution(state.draft);
  const openPicker = (field: PickerField) => {
    const now = new Date();
    const initial = new Date(now.getTime() + 5 * 60_000);
    const date = state.draft.date ?? civilDateFromLocalPicker(initial);
    const time = state.draft.time ?? civilTimeFromLocalPicker(initial);
    setPickerValue(field === 'date' && Platform.OS === 'android'
      ? createAndroidDatePickerValue(date)
      : createLocalPickerValue(date, time));
    setPicker(field);
  };
  const commit = (value: Date) => {
    if (picker === 'date') controller.changeDraft({
      date: Platform.OS === 'android'
        ? civilDateFromAndroidDatePicker(value)
        : civilDateFromLocalPicker(value),
      occurrence: null,
    }, context);
    if (picker === 'time') controller.changeDraft({ time: civilTimeFromLocalPicker(value), occurrence: null }, context);
    setPicker(null);
  };
  const error = (field: 'title' | 'date' | 'time') => state.fields[field] === undefined ? null :
    <AppText accessibilityLiveRegion="polite" style={styles.error}>
      {t(`reminders.errors.${state.fields[field]}` as 'reminders.errors.required')}
    </AppText>;
  return <Card style={styles.form}>
    <AppText variant="headingMedium">{t(state.editing === null ? 'reminders.new' : 'reminders.editTitle')}</AppText>
    <View style={styles.field}>
      <AppText nativeID="reminder-title" variant="label">{t('reminders.fields.title')}</AppText>
      <TextInput accessibilityLabelledBy="reminder-title" editable={!disabled} value={state.draft.title}
        onChangeText={(title) => controller.changeDraft({ title }, context)}
        placeholder={t('reminders.fields.titlePlaceholder')} placeholderTextColor={lightColors.textSecondary}
        style={[styles.input, state.fields.title && styles.inputError]} />
      <AppText variant="caption" style={styles.counter}>{t('reminders.characterCount', {
        count: Array.from(state.draft.title).length, max: 100,
      })}</AppText>
      {error('title')}
    </View>
    <View style={styles.field}>
      <AppText variant="label">{t('reminders.fields.when')}</AppText>
      <View style={styles.row}>
        <SelectButton disabled={disabled} onPress={() => openPicker('date')}>
          {state.draft.date === null ? t('reminders.fields.chooseDate') : formatDate(state.draft.date)}
        </SelectButton>
        <SelectButton disabled={disabled} onPress={() => openPicker('time')}>
          {state.draft.time === null ? t('reminders.fields.chooseTime') : formatTime(state.draft.time)}
        </SelectButton>
      </View>
      {error('date')}{error('time')}
    </View>
    {resolution?.status === 'ambiguous' && <View style={styles.field}>
      <AppText>{t('reminders.ambiguous.description')}</AppText>
      <Button disabled={disabled} variant={state.draft.occurrence === 0 ? 'primary' : 'secondary'}
        onPress={() => controller.changeDraft({ occurrence: 0 }, context)}>{t('reminders.ambiguous.first')}</Button>
      <Button disabled={disabled} variant={state.draft.occurrence === 1 ? 'primary' : 'secondary'}
        onPress={() => controller.changeDraft({ occurrence: 1 }, context)}>{t('reminders.ambiguous.second')}</Button>
    </View>}
    <Button disabled={disabled} accessibilityState={{ busy: state.busy, disabled }} onPress={() => void controller.save()}>
      {t(state.busy ? 'reminders.saving' : state.editing === null ? 'reminders.save' : 'reminders.saveEdit')}
    </Button>
    {state.editing !== null && <Button disabled={disabled} variant="secondary" onPress={controller.cancelEdit}>
      {t('reminders.cancel')}
    </Button>}
    <ReminderPicker field={picker} value={pickerValue} setValue={setPickerValue}
      onCancel={() => setPicker(null)} onConfirm={commit} />
  </Card>;
}

function SelectButton({ children, disabled, onPress }: Readonly<{
  children: string; disabled: boolean; onPress(): void;
}>) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.select, pressed && styles.selected, disabled && styles.disabled]}>
    <AppText>{children}</AppText>
  </Pressable>;
}

function ReminderPicker({ field, onCancel, onConfirm, setValue, value }: Readonly<{
  field: PickerField | null; onCancel(): void; onConfirm(value: Date): void;
  setValue(value: Date): void; value: Date;
}>) {
  const { t } = useTranslation();
  if (field === null) return null;
  const now = new Date();
  const today = Platform.OS === 'android'
    ? createAndroidDatePickerValue(civilDateFromLocalPicker(now))
    : createLocalPickerValue(civilDateFromLocalPicker(now));
  const picker = <DateTimePicker accentColor={lightColors.actionPrimary} display="spinner" is24Hour
    minimumDate={field === 'date' ? today : undefined} mode={field}
    negativeButton={{ label: t('reminders.cancel') }} onDismiss={onCancel}
    onValueChange={(_event, date) => Platform.OS === 'android' ? onConfirm(date) : setValue(date)}
    positiveButton={{ label: t('reminders.confirm') }} presentation="dialog" themeVariant="light" value={value} />;
  if (Platform.OS === 'android') return picker;
  return <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
    <View accessibilityViewIsModal style={styles.backdrop}><Card style={styles.modalCard}>{picker}
      <View style={styles.row}><Button style={styles.actionFlex} variant="secondary" onPress={onCancel}>{t('reminders.cancel')}</Button>
        <Button style={styles.actionFlex} onPress={() => onConfirm(value)}>{t('reminders.confirm')}</Button></View>
    </Card></View>
  </Modal>;
}

function NotificationCard({ controller, state }: Readonly<{ controller: ReminderController; state: ReminderState }>) {
  const { t } = useTranslation();
  const permission = state.notificationPermission;
  const reconciliation = state.notificationReconciliation?.status;
  const key = permission === 'denied' ? 'denied' : permission === 'unavailable' ? 'unavailable'
    : reconciliation === 'degraded' ? 'degraded' : permission === 'authorized' || permission === 'provisional' || permission === 'ephemeral'
      ? 'enabled' : 'notEnabled';
  return <Card style={styles.section}>
    <AppText variant="headingSmall">{t('reminders.notifications.title')}</AppText>
    <AppText style={styles.secondary}>{t(`reminders.notifications.${key}` as 'reminders.notifications.enabled')}</AppText>
    {permission !== 'authorized' && permission !== 'provisional' && permission !== 'ephemeral' && <Button disabled={state.notificationBusy}
      onPress={() => void controller.requestNotifications()}>
      {t(state.notificationBusy ? 'reminders.notifications.requesting' : 'reminders.notifications.activate')}
    </Button>}
    <AppText variant="caption" style={styles.secondary}>{t('reminders.notifications.savedSeparately')}</AppText>
  </Card>;
}

function ReminderRows({ controller, items, locked, mode }: Readonly<{
  controller: ReminderController; items: readonly Reminder[]; locked: boolean; mode: 'upcoming' | 'past';
}>) {
  const { t } = useTranslation();
  const remove = (reminder: Reminder) => {
    const confirm = controller.prepareDeleteConfirmation(reminder);
    if (confirm === null) return;
    Alert.alert(t('reminders.delete.title'), t('reminders.delete.description'), [
      { text: t('reminders.cancel'), style: 'cancel' },
      { text: t('reminders.delete.confirm'), style: 'destructive', onPress: () => void confirm() },
    ]);
  };
  if (items.length === 0) return <Card><AppText style={styles.secondary}>{t(mode === 'upcoming'
    ? 'reminders.emptyUpcoming' : 'reminders.emptyPast')}</AppText></Card>;
  return <View style={styles.list}>{items.map((reminder) => <Card key={reminder.id} style={styles.item}>
    <AppText variant="headingSmall">{reminder.title}</AppText>
    <AppText style={styles.secondary}>{formatReminderDateTime(reminder)}</AppText>
    <View style={styles.actions}>
      {mode === 'upcoming' && <Button disabled={locked} variant="secondary" onPress={() => controller.edit(reminder)}
        accessibilityLabel={t('reminders.editAccessibility', { title: reminder.title })}>{t('reminders.edit')}</Button>}
      <Button disabled={locked} variant="secondary" onPress={() => remove(reminder)}
        accessibilityLabel={t('reminders.deleteAccessibility', { title: reminder.title })}>{t('reminders.delete.action')}</Button>
    </View>
  </Card>)}</View>;
}

export function ReminderScreen({ mode }: Readonly<{ mode: 'upcoming' | 'past' }>) {
  const { state, controller } = useReminders();
  const { t } = useTranslation();
  const router = useRouter();
  const snapshot = mode === 'upcoming' ? state.upcoming : state.past;
  const locked = state.busy || state.pending !== null;
  return <Screen style={styles.screen}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.heading}><AppText accessibilityRole="header" variant="headingLarge">{t(mode === 'upcoming' ? 'reminders.title' : 'reminders.historyTitle')}</AppText>
        {snapshot !== null && <AppText style={styles.secondary}>{t('reminders.forChild', { name: snapshot.child.displayName })}</AppText>}</View>
      {state.feedback !== null && <AppText accessibilityLiveRegion="polite" style={styles.secondary}>
        {t(`reminders.feedback.${state.feedback}` as 'reminders.feedback.failure')}
      </AppText>}
      {state.pending !== null && <Card style={styles.section}><AppText variant="headingSmall">{t('reminders.uncertain.title')}</AppText>
        <AppText>{t(snapshot?.context.childId === state.pending.attempt.childId
          ? 'reminders.uncertain.description' : 'reminders.uncertain.otherChild')}</AppText>
        <Button disabled={state.busy || snapshot?.context.childId !== state.pending.attempt.childId}
          onPress={() => void controller.checkStatus()}>{t('reminders.uncertain.check')}</Button></Card>}
      {state.status === 'loading' && <View style={styles.section}><ActivityIndicator color={lightColors.actionPrimary} />
        <AppText>{t('reminders.loading')}</AppText></View>}
      {state.status === 'error' && <Card style={styles.section}><AppText>{t('reminders.readError')}</AppText>
        <Button onPress={() => void controller.refresh()}>{t('reminders.retry')}</Button></Card>}
      {state.status === 'missing' && <Card><AppText>{t('reminders.missing')}</AppText></Card>}
      {state.status === 'ready' && snapshot !== null && <>
        {(state.feedback === 'conflict' || state.feedback === 'notFound') && <Button variant="secondary"
          onPress={() => { controller.cancelEdit(); void controller.refresh(); }}>{t('reminders.refresh')}</Button>}
        {mode === 'upcoming' && <ReminderForm controller={controller} state={state} />}
        <View style={styles.listHeading}><AppText variant="headingMedium">{t(mode === 'upcoming'
          ? 'reminders.upcoming' : 'reminders.past')}</AppText>
          <Button variant="secondary" disabled={state.refreshing || locked}
            onPress={() => void controller.refresh()}>{t('reminders.refresh')}</Button></View>
        <ReminderRows controller={controller} items={snapshot.value.items} locked={locked} mode={mode} />
        {state.pageError === mode && <AppText accessibilityLiveRegion="polite" style={styles.error}>{t('reminders.pageError')}</AppText>}
        {snapshot.value.nextCursor !== null && <Button variant="secondary" disabled={locked || state.paging !== null}
          onPress={() => void controller.loadMore(mode)}>{t(state.paging === mode ? 'reminders.loadingMore' : 'reminders.loadMore')}</Button>}
        {mode === 'upcoming' && <NotificationCard controller={controller} state={state} />}
        <Button variant="secondary" onPress={() => router.push(mode === 'upcoming' ? '/reminder-history' : '/reminders')}>
          {t(mode === 'upcoming' ? 'reminders.openHistory' : 'reminders.openUpcoming')}
        </Button>
      </>}
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none }, flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  heading: { gap: spacing.xs }, section: { gap: spacing.md }, form: { gap: spacing.xl, ...shadows.raised },
  listHeading: { gap: spacing.sm },
  field: { gap: spacing.sm }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, actionFlex: { flex: 1, minWidth: 120 },
  input: { minHeight: 52, padding: spacing.md, borderWidth: 1, borderColor: lightColors.borderSubtle,
    borderRadius: radii.md, backgroundColor: lightColors.surface, color: lightColors.textPrimary, ...typography.body },
  inputError: { borderColor: lightColors.error }, counter: { color: lightColors.textSecondary, textAlign: 'right' },
  select: { flex: 1, minWidth: 140, minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: lightColors.borderSubtle, borderRadius: radii.md, backgroundColor: lightColors.surface },
  selected: { backgroundColor: lightColors.surfaceMuted }, disabled: { opacity: 0.5 },
  secondary: { color: lightColors.textSecondary }, error: { color: lightColors.error },
  list: { gap: spacing.md }, item: { gap: spacing.sm }, actions: { gap: spacing.sm, marginTop: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(38, 48, 42, 0.35)' },
  modalCard: { gap: spacing.lg },
});
