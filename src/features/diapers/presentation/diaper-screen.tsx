import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, radii, spacing } from '@/theme/tokens';
import {
  civilDateFromAndroidDatePicker,
  civilDateFromLocalPicker,
  civilTimeFromLocalPicker,
  createAndroidDatePickerValue,
  createLocalPickerValue,
  resolveLocalCivilDateTime,
  type CivilDate,
  type CivilTime,
} from '@/utils/local-civil-date-time';
import type { DiaperKind } from '../domain/diaper-event';
import type { DiaperEvent } from '../domain/diaper-event';
import { formatDiaperClock, formatDiaperDateHeading, groupDiapersByLocalDate } from './diaper-format';
import {
  confirmDiaperDate,
  confirmDiaperTime,
  diaperPickerMaximumDate,
  emptyManualDiaperDraft,
  manualDiaperDraftFromEvent,
  resolveEditedDiaperTimestamp,
  resolveManualDiaperInstant,
  type ManualDiaperDraft,
} from './manual-diaper-form';
import { createDiaperDeleteConfirmationActions } from './diaper-delete-confirmation';
import { openDiaperHistory } from './diaper-history-navigation';
import { useDiapers } from './use-diapers';

type PickerField = 'date' | 'time';
const kinds: readonly DiaperKind[] = ['wet', 'dirty', 'mixed'];

export function DiaperScreen({ mode = 'logging' }: Readonly<{
  mode?: 'logging' | 'history';
}>) {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, controller } = useDiapers();
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState<ManualDiaperDraft>(emptyManualDiaperDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerField | null>(null);
  const [pickerValue, setPickerValue] = useState(new Date());
  const [openedAt, setOpenedAt] = useState(new Date());
  const [formChildId, setFormChildId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<DiaperEvent | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const readyChildId = state.status === 'ready' ? state.value.childId : null;

  useEffect(() => {
    if (readyChildId === null || readyChildId === formChildId) return;
    setManualOpen(false);
    setDraft(emptyManualDiaperDraft);
    setFormError(null);
    setPicker(null);
    setEditingEvent(null);
    setCorrectionError(null);
    setFormChildId(readyChildId);
  }, [formChildId, readyChildId]);

  if (state.status === 'loading') return <Screen style={styles.centered}>
    <ActivityIndicator color={lightColors.actionPrimary} />
    <AppText>{t('diapers.loading')}</AppText>
  </Screen>;
  if (state.status === 'error') return <Screen style={styles.centered}><Card style={styles.card}>
    <AppText variant="headingMedium">{t('diapers.error.title')}</AppText>
    <AppText style={styles.secondary}>{t('diapers.error.description')}</AppText>
    <Button onPress={() => void controller.refresh()}>{t('bootstrap.retry')}</Button>
  </Card></Screen>;
  if (formChildId !== state.value.childId) return <Screen style={styles.centered}>
    <ActivityIndicator color={lightColors.actionPrimary} />
  </Screen>;

  const openPicker = (field: PickerField) => {
    const now = new Date();
    const date = draft.date ?? civilDateFromLocalPicker(now);
    const time = draft.time ?? civilTimeFromLocalPicker(now);
    setOpenedAt(now);
    setPickerValue(field === 'date' && Platform.OS === 'android'
      ? createAndroidDatePickerValue(date)
      : createLocalPickerValue(date, time));
    setFormError(null);
    setPicker(field);
  };

  const commitPicker = (value: Date) => {
    if (picker === null) return;
    const now = new Date();
    const currentCivil = { ...civilDateFromLocalPicker(now), ...civilTimeFromLocalPicker(now) };
    const result = picker === 'date'
      ? confirmDiaperDate(
          draft,
          Platform.OS === 'android'
            ? civilDateFromAndroidDatePicker(value)
            : civilDateFromLocalPicker(value),
          currentCivil,
        )
      : confirmDiaperTime(draft, civilTimeFromLocalPicker(value), currentCivil);
    if (result.status === 'future') setFormError(t('diapers.manual.errors.future'));
    else {
      setDraft(result.draft);
      setFormError(null);
    }
    setPicker(null);
  };

  const saveForm = async () => {
    if (draft.kind === null) { setFormError(t('diapers.manual.errors.kind')); return; }
    const resolution = resolveManualDiaperInstant(draft);
    if (resolution.status !== 'valid') {
      setFormError(t(
        resolution.status === 'incomplete' ? 'diapers.manual.errors.incomplete' :
          resolution.status === 'nonexistent' ? 'diapers.manual.errors.nonexistent' :
            'diapers.manual.errors.ambiguous',
      ));
      return;
    }
    const result = editingEvent === null
      ? await controller.record({
          timing: 'historical', kind: draft.kind, occurredAtEpochMs: resolution.epochMs,
        })
      : await controller.updateEvent({
          expected: editingEvent,
          kind: draft.kind,
          occurredAtEpochMs: resolveEditedDiaperTimestamp(
            editingEvent.occurredAtEpochMs,
            resolution.epochMs,
          ),
        });
    if (result === 'saved') {
      closeForm();
    } else if (result === 'success') {
      closeForm();
    } else if (result === 'future') setFormError(t('diapers.manual.errors.future'));
    else if (result === 'not-saved') setFormError(t('diapers.errors.notSaved'));
    else if (result === 'not-applied') setFormError(t('diapers.correction.notApplied'));
  };

  const closeForm = () => {
    setDraft(emptyManualDiaperDraft);
    setFormError(null);
    setEditingEvent(null);
    setManualOpen(false);
  };

  const editEvent = (event: DiaperEvent) => {
    controller.clearFeedback();
    setCorrectionError(null);
    setEditingEvent(event);
    setDraft(manualDiaperDraftFromEvent(event));
    setFormError(null);
    setManualOpen(true);
  };

  const deleteEvent = async (event: DiaperEvent) => {
    const result = await controller.deleteEvent(event);
    if (result === 'not-applied') setCorrectionError(t('diapers.correction.notApplied'));
  };

  const confirmDelete = (event: DiaperEvent) => Alert.alert(
    t('diapers.correction.delete.title'),
    t('diapers.correction.delete.description'),
    createDiaperDeleteConfirmationActions(
      {
        cancel: t('diapers.correction.cancel'),
        confirm: t('diapers.correction.delete.confirm'),
      },
      () => void deleteEvent(event),
    ),
  );

  const openCorrectionMenu = (event: DiaperEvent) => {
    controller.clearFeedback();
    setCorrectionError(null);
    Alert.alert(
      `${formatDiaperClock(event.occurredAtEpochMs)} · ${t(`diapers.kind.${event.kind}`)}`,
      undefined,
      [
        { text: t('diapers.correction.edit'), onPress: () => editEvent(event) },
        {
          text: t('diapers.correction.delete.action'),
          style: 'destructive',
          onPress: () => confirmDelete(event),
        },
        { text: t('diapers.correction.cancel'), style: 'cancel' },
      ],
    );
  };

  const groups = groupDiapersByLocalDate(state.value.events);
  const form = <Card style={styles.card}>
    <AppText variant="headingMedium">{t(
      editingEvent === null ? 'diapers.manual.title' : 'diapers.correction.editTitle',
    )}</AppText>
    <AppText style={styles.secondary}>{t(
      editingEvent === null ? 'diapers.manual.description' : 'diapers.correction.editDescription',
    )}</AppText>
    <AppText variant="label">{t('diapers.manual.kind')}</AppText>
    <View style={styles.kindRow}>{kinds.map((kind) => <Button
      key={kind}
      onPress={() => { setDraft({ ...draft, kind }); setFormError(null); }}
      style={styles.kindButton}
      variant={draft.kind === kind ? 'primary' : 'secondary'}>
      {t(`diapers.kind.${kind}`)}
    </Button>)}</View>
    <View style={styles.kindRow}>
      <SelectButton onPress={() => openPicker('date')}>
        {draft.date === null ? t('diapers.manual.date') : formatCivilDate(draft.date)}
      </SelectButton>
      <SelectButton onPress={() => openPicker('time')}>
        {draft.time === null ? t('diapers.manual.time') : formatCivilTime(draft.time)}
      </SelectButton>
    </View>
    {draft.date !== null && draft.time !== null &&
      resolveLocalCivilDateTime({ ...draft.date, ...draft.time }).status === 'ambiguous' &&
      <View style={styles.card}>
        <AppText style={styles.secondary}>{t('diapers.manual.ambiguous.description')}</AppText>
        <Button onPress={() => setDraft({ ...draft, occurrence: 0 })} variant={draft.occurrence === 0 ? 'primary' : 'secondary'}>
          {t('diapers.manual.ambiguous.first')}
        </Button>
        <Button onPress={() => setDraft({ ...draft, occurrence: 1 })} variant={draft.occurrence === 1 ? 'primary' : 'secondary'}>
          {t('diapers.manual.ambiguous.second')}
        </Button>
      </View>}
    {formError !== null && <AppText accessibilityLiveRegion="polite" style={styles.error}>{formError}</AppText>}
    <Button disabled={state.busy || state.feedback.status === 'uncertain'} onPress={() => void saveForm()}>
      {state.busy ? t('diapers.manual.saving') : t(
        editingEvent === null ? 'diapers.manual.save' : 'diapers.correction.save',
      )}
    </Button>
    <Button disabled={state.busy} onPress={closeForm} variant="secondary">
      {t('diapers.manual.cancel')}
    </Button>
  </Card>;

  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.introduction}>
      <AppText variant="headingLarge">{t(
        mode === 'logging' ? 'diapers.title' : 'diapers.history.title',
      )}</AppText>
      <AppText style={styles.secondary}>{t(
        mode === 'logging' ? 'diapers.description' : 'diapers.history.description',
      )}</AppText>
    </View>

    {mode === 'logging' && <>
      <Card style={styles.card}>
        <AppText variant="headingMedium">{t('diapers.now.title')}</AppText>
        <View style={styles.fastActionRow}>{kinds.map((kind) => <Button
            accessibilityLabel={t(`diapers.kind.${kind}`)}
            disabled={state.busy || state.feedback.status === 'uncertain'}
            key={kind}
            onPress={() => void controller.record({ timing: 'now', kind })}
            style={styles.fastAction}
            variant="secondary">
            {t(`diapers.kind.${kind}`)}
          </Button>)}</View>
        {state.feedback.status === 'saved' && <View accessibilityLiveRegion="polite" style={styles.feedbackRow}>
          <AppText style={styles.success}>{t(`diapers.success.${state.feedback.event.kind}`)}</AppText>
          <Pressable accessibilityLabel={t('diapers.undo.action')} accessibilityRole="button"
            disabled={state.busy} onPress={() => void controller.undo()} style={styles.feedbackAction}>
            <AppText variant="label" style={styles.feedbackActionText}>{t('diapers.undo.action')}</AppText>
          </Pressable>
        </View>}
        {state.feedback.status === 'saved' && state.feedback.undoFailed &&
          <AppText style={styles.error}>{t('diapers.undo.notApplied')}</AppText>}
        {state.feedback.status === 'notice' && <AppText accessibilityLiveRegion="polite" style={styles.success}>
          {t(`diapers.notice.${state.feedback.kind}`)}
        </AppText>}
        {state.feedback.status === 'not-saved' && <AppText style={styles.error}>{t('diapers.errors.notSaved')}</AppText>}
        {state.feedback.status === 'uncertain' && <View style={styles.notice}>
          <AppText variant="label">{t('diapers.uncertain.title')}</AppText>
          <AppText style={styles.secondary}>{t('diapers.uncertain.description')}</AppText>
          <Button onPress={() => openDiaperHistory(
            controller.clearFeedback,
            (route) => router.push(route),
          )}>{t('diapers.uncertain.action')}</Button>
        </View>}
      </Card>
      {!manualOpen ? <View style={styles.manualAction}>
        <View style={styles.introduction}>
          <AppText variant="headingMedium">{t('diapers.manual.closedTitle')}</AppText>
          <AppText style={styles.secondary}>{t('diapers.manual.closedDescription')}</AppText>
        </View>
        <Button onPress={() => {
          controller.clearFeedback(); setEditingEvent(null); setManualOpen(true);
        }} variant="secondary">{t('diapers.manual.open')}</Button>
      </View> : form}
      <Button onPress={() => openDiaperHistory(
        controller.clearFeedback,
        (route) => router.push(route),
      )}
        variant="secondary">{t('diapers.history.open')}</Button>
    </>}

    {mode === 'history' && <>
      {state.feedback.status === 'notice' && <AppText accessibilityLiveRegion="polite" style={styles.success}>
        {t(`diapers.notice.${state.feedback.kind}`)}
      </AppText>}
      {state.feedback.status === 'uncertain' && <View style={styles.notice}>
        <AppText variant="label">{t('diapers.uncertain.title')}</AppText>
        <AppText style={styles.secondary}>{t('diapers.uncertain.description')}</AppText>
        <Button onPress={() => void controller.refresh()}>{t('diapers.uncertain.action')}</Button>
      </View>}
      {editingEvent !== null ? form : <View style={styles.history}>
      {correctionError !== null && <AppText style={styles.error}>{correctionError}</AppText>}
      {groups.length === 0 ? <AppText style={styles.secondary}>{t('diapers.history.empty')}</AppText> :
        groups.map((group) => <View key={group.key} style={styles.group}>
          <AppText variant="headingSmall">{formatDiaperDateHeading(
            group.headingEpochMs, state.value.nowEpochMs,
            { today: t('diapers.history.today'), yesterday: t('diapers.history.yesterday') },
          )}</AppText>
          {group.events.map((event) => <Card key={event.id} style={styles.eventCard}>
            <AppText style={styles.eventValue}>{formatDiaperClock(event.occurredAtEpochMs)} · {t(`diapers.kind.${event.kind}`)}</AppText>
            <Pressable accessibilityLabel={t('diapers.correction.menuAccessibility', {
              kind: t(`diapers.kind.${event.kind}`),
              time: formatDiaperClock(event.occurredAtEpochMs),
            })} accessibilityRole="button" disabled={state.busy}
              onPress={() => openCorrectionMenu(event)} style={styles.menuButton}>
              <AppText variant="headingSmall">•••</AppText>
            </Pressable>
          </Card>)}
        </View>)}
      </View>}
    </>}
    <Picker field={picker} maximumDate={openedAt} onCancel={() => setPicker(null)}
      onConfirm={commitPicker} setValue={setPickerValue} value={pickerValue} />
  </ScrollView></Screen>;
}

function formatCivilDate(value: CivilDate): string {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(createLocalPickerValue(value));
}
function formatCivilTime(value: CivilTime): string {
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}
function SelectButton({ children, onPress }: { children: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.select}>
    <AppText>{children}</AppText>
  </Pressable>;
}
function Picker({ field, maximumDate, onCancel, onConfirm, setValue, value }: {
  field: PickerField | null; maximumDate: Date; onCancel(): void; onConfirm(value: Date): void;
  setValue(value: Date): void; value: Date;
}) {
  const { t } = useTranslation();
  if (field === null) return null;
  const pickerMaximum = diaperPickerMaximumDate(
    field,
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other',
    maximumDate,
  );
  const picker = <DateTimePicker accentColor={lightColors.actionPrimary} display="spinner" is24Hour
    maximumDate={pickerMaximum}
    mode={field} negativeButton={{ label: t('diapers.manual.cancel') }} onDismiss={onCancel}
    onValueChange={(_event, date) => Platform.OS === 'android' ? onConfirm(date) : setValue(date)}
    positiveButton={{ label: t('onboarding.firstChild.dateOfBirth.confirm') }}
    presentation="dialog" themeVariant="light" value={value} />;
  if (Platform.OS === 'android') return picker;
  return <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
    <View accessibilityViewIsModal style={styles.backdrop}><Card style={styles.card}>{picker}
      <View style={styles.kindRow}><Button onPress={onCancel} style={styles.kindButton} variant="secondary">
        {t('diapers.manual.cancel')}
      </Button><Button onPress={() => onConfirm(value)} style={styles.kindButton}>
        {t('onboarding.firstChild.dateOfBirth.confirm')}
      </Button></View>
    </Card></View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none }, content: { padding: spacing.lg, gap: spacing.xl },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  introduction: { gap: spacing.sm }, card: { width: '100%', gap: spacing.md },
  secondary: { color: lightColors.textSecondary }, success: { color: lightColors.success },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  feedbackAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  feedbackActionText: { color: lightColors.actionPrimary },
  error: { color: lightColors.error }, notice: { gap: spacing.sm, backgroundColor: lightColors.surfaceMuted, padding: spacing.md },
  fastActionRow: { flexDirection: 'row', gap: spacing.sm },
  fastAction: { flex: 1, paddingHorizontal: spacing.sm },
  manualAction: { gap: spacing.md },
  kindRow: { flexDirection: 'row', gap: spacing.sm }, kindButton: { flex: 1 },
  select: { flex: 1, minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: lightColors.borderSubtle, borderRadius: radii.md },
  history: { gap: spacing.md }, group: { gap: spacing.sm },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventValue: { flex: 1 },
  menuButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(38, 48, 42, 0.35)' },
});
