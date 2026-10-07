import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { lightColors, radii, spacing } from '@/theme/tokens';

import type { createSleepController } from './sleep-controller';
import {
  civilDateFromAndroidDatePicker,
  civilDateFromLocalPicker,
  civilTimeFromLocalPicker,
  createAndroidDatePickerValue,
  createLocalPickerValue,
  formatCivilDate,
  formatCivilTime,
  resolveManualSleepInterval,
  resolveLocalCivilDateTime,
  type CivilDate,
  type CivilTime,
  type LocalCivilResolution,
} from './manual-sleep-date-time';
import {
  confirmManualSleepDate,
  confirmManualSleepTime,
  clearManualSleepPickerError,
  createEmptyManualSleepDraft,
  manualSleepPickerErrorKey,
  manualSleepBlurAction,
  manualSleepPickerMaximumDate,
  type ManualSleepDraft,
  type ManualSleepEndpoint,
  type ManualSleepFormMode,
  type ManualSleepOccurrence,
} from './manual-sleep-form-state';

type Controller = ReturnType<typeof createSleepController>;
type Field = 'date' | 'time';
type PickerTarget = Readonly<{ endpoint: ManualSleepEndpoint; field: Field }>;

function endpointResolution(
  date: CivilDate | null,
  time: CivilTime | null,
): LocalCivilResolution | null {
  return date === null || time === null
    ? null
    : resolveLocalCivilDateTime({ ...date, ...time });
}

function intervalSummary(draft: ManualSleepDraft): string | null {
  if (!draft.startDate || !draft.startTime || !draft.endDate || !draft.endTime) return null;
  return `${formatCivilDate(draft.startDate)} ${formatCivilTime(draft.startTime)} – ${formatCivilDate(draft.endDate)} ${formatCivilTime(draft.endTime)}`;
}

export function ManualSleepEntry({
  childId,
  controller,
}: Readonly<{ childId: string; controller: Controller }>) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ManualSleepFormMode>('closed');
  const modeRef = useRef(mode);
  const [draft, setDraft] = useState<ManualSleepDraft>(createEmptyManualSleepDraft);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerValue, setPickerValue] = useState(() => new Date());
  const [pickerMaximumDate, setPickerMaximumDate] = useState(() => new Date());
  const submissionLocked = useRef(false);
  const requestId = useRef(0);
  modeRef.current = mode;

  const changeMode = useCallback((next: ManualSleepFormMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    submissionLocked.current = false;
    setDraft(createEmptyManualSleepDraft());
    setError(clearManualSleepPickerError());
    setPicker(null);
    changeMode('closed');
  }, [changeMode]);

  useEffect(() => reset(), [childId, reset]);
  useFocusEffect(useCallback(() => () => {
    const action = manualSleepBlurAction(modeRef.current);
    if (action === 'reset') {
      reset();
    } else if (action === 'lock-uncertain') {
      requestId.current += 1;
      changeMode('uncertain');
    }
  }, [changeMode, reset]));

  const startResolution = useMemo(
    () => endpointResolution(draft.startDate, draft.startTime),
    [draft.startDate, draft.startTime],
  );
  const endResolution = useMemo(
    () => endpointResolution(draft.endDate, draft.endTime),
    [draft.endDate, draft.endTime],
  );

  const openPicker = (target: PickerTarget) => {
    const current = new Date();
    const date = target.endpoint === 'start' ? draft.startDate : draft.endDate;
    const time = target.endpoint === 'start' ? draft.startTime : draft.endTime;
    const initialDate = date ?? civilDateFromLocalPicker(current);
    const initialTime = time ?? civilTimeFromLocalPicker(current);
    setPickerValue(
      target.field === 'date'
        ? Platform.OS === 'android'
          ? createAndroidDatePickerValue(initialDate)
          : createLocalPickerValue(initialDate)
        : createLocalPickerValue(initialDate, initialTime),
    );
    setPickerMaximumDate(current);
    setError(clearManualSleepPickerError());
    setPicker(target);
  };

  const commitPicker = (value: Date) => {
    if (picker === null) return;
    const selected = picker.field === 'date'
      ? Platform.OS === 'android'
        ? civilDateFromAndroidDatePicker(value)
        : civilDateFromLocalPicker(value)
      : civilTimeFromLocalPicker(value);
    const current = new Date();
    const currentCivil = {
      ...civilDateFromLocalPicker(current),
      ...civilTimeFromLocalPicker(current),
    };
    const result = picker.field === 'date'
      ? confirmManualSleepDate(draft, picker.endpoint, selected as CivilDate, currentCivil)
      : confirmManualSleepTime(draft, picker.endpoint, selected as CivilTime, currentCivil);
    const pickerErrorKey = manualSleepPickerErrorKey(result);
    if (pickerErrorKey === null) {
      setDraft(result.draft);
      setError(null);
    } else {
      setError(t(pickerErrorKey));
    }
    setPicker(null);
  };

  const save = async () => {
    if (submissionLocked.current || mode !== 'editing') return;
    if (!draft.startDate || !draft.startTime || !draft.endDate || !draft.endTime) {
      setError(t('sleep.manual.errors.incomplete'));
      return;
    }
    const interval = resolveManualSleepInterval(
      { ...draft.startDate, ...draft.startTime },
      { ...draft.endDate, ...draft.endTime },
      draft.startOccurrence,
      draft.endOccurrence,
    );
    if (interval.status !== 'valid') {
      setError(t(
        interval.status === 'nonexistent' ? 'sleep.manual.errors.nonexistent' :
          interval.status === 'ambiguous' ? 'sleep.manual.errors.ambiguous' :
            'sleep.manual.errors.range',
      ));
      return;
    }

    submissionLocked.current = true;
    const request = ++requestId.current;
    changeMode('saving');
    setError(null);
    const result = await controller.recordCompleted(
      interval.startedAtEpochMs,
      interval.endedAtEpochMs,
    );
    if (request !== requestId.current) return;
    if (result === 'saved') {
      changeMode('success');
      return;
    }
    if (result === 'uncertain') {
      changeMode('uncertain');
      return;
    }
    submissionLocked.current = false;
    changeMode('editing');
    setError(t(
      result === 'future' ? 'sleep.manual.errors.future' :
        result === 'overlap' ? 'sleep.manual.errors.overlap' :
          'sleep.manual.errors.notSaved',
    ));
  };

  if (mode === 'closed') {
    return <Button onPress={() => changeMode('editing')} variant="secondary">
      {t('sleep.manual.open')}
    </Button>;
  }

  if (mode === 'success') {
    return <Card style={styles.section}>
      <AppText variant="headingSmall">{t('sleep.manual.success.title')}</AppText>
      <AppText style={styles.secondary}>{t('sleep.manual.success.description')}</AppText>
      <Button onPress={reset}>{t('sleep.manual.success.done')}</Button>
    </Card>;
  }

  if (mode === 'uncertain') {
    return <Card style={styles.section}>
      <AppText variant="headingSmall">{t('sleep.manual.uncertain.title')}</AppText>
      <AppText style={styles.secondary}>{t('sleep.manual.uncertain.description')}</AppText>
      <Button onPress={() => { void controller.refresh(); }}>
        {t('sleep.manual.uncertain.action')}
      </Button>
    </Card>;
  }

  const disabled = mode === 'saving';
  const summary = intervalSummary(draft);

  return <Card style={styles.section}>
    <AppText variant="headingSmall">{t('sleep.manual.title')}</AppText>
    <AppText style={styles.secondary}>{t('sleep.manual.description')}</AppText>
    <EndpointFields
      date={draft.startDate}
      disabled={disabled}
      label={t('sleep.manual.start')}
      onOpen={(field) => openPicker({ endpoint: 'start', field })}
      time={draft.startTime}
    />
    {startResolution?.status === 'ambiguous' && <OccurrenceChoice
      onSelect={(value) => setDraft((current) => ({ ...current, startOccurrence: value }))}
      selected={draft.startOccurrence}
    />}
    <EndpointFields
      date={draft.endDate}
      disabled={disabled}
      label={t('sleep.manual.end')}
      onOpen={(field) => openPicker({ endpoint: 'end', field })}
      time={draft.endTime}
    />
    {endResolution?.status === 'ambiguous' && <OccurrenceChoice
      onSelect={(value) => setDraft((current) => ({ ...current, endOccurrence: value }))}
      selected={draft.endOccurrence}
    />}
    {summary !== null && <View style={styles.summary}>
      <AppText variant="label">{t('sleep.manual.summary')}</AppText>
      <AppText>{summary}</AppText>
    </View>}
    {error !== null && <AppText accessibilityLiveRegion="polite" style={styles.error}>
      {error}
    </AppText>}
    <Button disabled={disabled} onPress={() => void save()}>
      {disabled ? t('sleep.manual.saving') : t('sleep.manual.save')}
    </Button>
    <Button disabled={disabled} onPress={reset} variant="secondary">
      {t('sleep.manual.cancel')}
    </Button>
    <Picker
      onCancel={() => {
        setPicker(null);
        setError(clearManualSleepPickerError());
      }}
      onConfirm={commitPicker}
      maximumDate={pickerMaximumDate}
      setValue={setPickerValue}
      target={picker}
      value={pickerValue}
    />
  </Card>;
}

function EndpointFields({ date, disabled, label, onOpen, time }: Readonly<{
  date: CivilDate | null;
  disabled: boolean;
  label: string;
  onOpen(field: Field): void;
  time: CivilTime | null;
}>) {
  const { t } = useTranslation();
  return <View style={styles.endpoint}>
    <AppText variant="label">{label}</AppText>
    <View style={styles.fieldRow}>
      <SelectButton disabled={disabled} onPress={() => onOpen('date')}>
        {date === null ? t('sleep.manual.date') : formatCivilDate(date)}
      </SelectButton>
      <SelectButton disabled={disabled} onPress={() => onOpen('time')}>
        {time === null ? t('sleep.manual.time') : formatCivilTime(time)}
      </SelectButton>
    </View>
  </View>;
}

function SelectButton({ children, disabled, onPress }: Readonly<{
  children: string;
  disabled: boolean;
  onPress(): void;
}>) {
  return <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.select, pressed && styles.selectPressed, disabled && styles.disabled]}>
    <AppText>{children}</AppText>
  </Pressable>;
}

function OccurrenceChoice({ onSelect, selected }: Readonly<{
  onSelect(value: 0 | 1): void;
  selected: ManualSleepOccurrence;
}>) {
  const { t } = useTranslation();
  return <View style={styles.occurrence}>
    <AppText style={styles.secondary}>{t('sleep.manual.ambiguous.description')}</AppText>
    <Button onPress={() => onSelect(0)} variant={selected === 0 ? 'primary' : 'secondary'}>
      {t('sleep.manual.ambiguous.first')}
    </Button>
    <Button onPress={() => onSelect(1)} variant={selected === 1 ? 'primary' : 'secondary'}>
      {t('sleep.manual.ambiguous.second')}
    </Button>
  </View>;
}

function Picker({ maximumDate, onCancel, onConfirm, setValue, target, value }: Readonly<{
  maximumDate: Date;
  onCancel(): void;
  onConfirm(value: Date): void;
  setValue(value: Date): void;
  target: PickerTarget | null;
  value: Date;
}>) {
  const { t } = useTranslation();
  if (target === null) return null;
  const pickerMaximum = manualSleepPickerMaximumDate(
    target.field,
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other',
    maximumDate,
  );
  const picker = <DateTimePicker
    accentColor={lightColors.actionPrimary}
    display="spinner"
    is24Hour
    maximumDate={pickerMaximum}
    mode={target.field}
    negativeButton={{ label: t('sleep.manual.cancel') }}
    onDismiss={onCancel}
    onValueChange={(_event, date) => {
      if (Platform.OS === 'android') onConfirm(date);
      else setValue(date);
    }}
    positiveButton={{ label: t('onboarding.firstChild.dateOfBirth.confirm') }}
    presentation="dialog"
    themeVariant="light"
    value={value}
  />;
  if (Platform.OS === 'android') return picker;
  return <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
    <View accessibilityViewIsModal style={styles.backdrop}>
      <Card style={styles.modalCard}>
        {picker}
        <View style={styles.fieldRow}>
          <Button onPress={onCancel} style={styles.action} variant="secondary">
            {t('sleep.manual.cancel')}
          </Button>
          <Button onPress={() => onConfirm(value)} style={styles.action}>
            {t('onboarding.firstChild.dateOfBirth.confirm')}
          </Button>
        </View>
      </Card>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  secondary: { color: lightColors.textSecondary },
  endpoint: { gap: spacing.sm },
  fieldRow: { flexDirection: 'row', gap: spacing.md },
  select: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: lightColors.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: lightColors.surface,
  },
  selectPressed: { backgroundColor: lightColors.surfaceMuted },
  disabled: { opacity: 0.5 },
  summary: { gap: spacing.xs, padding: spacing.md, backgroundColor: lightColors.surfaceMuted },
  occurrence: { gap: spacing.sm },
  error: { color: lightColors.error },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(38, 48, 42, 0.35)',
  },
  modalCard: { gap: spacing.lg },
  action: { flex: 1 },
});
