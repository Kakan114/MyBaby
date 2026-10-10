import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { lightColors, spacing } from '@/theme/tokens';
import { getCalendarDateParts, createCalendarDateFromParts, type CalendarDate } from '../../children/domain/calendar-date';
import { civilDateFromAndroidDatePicker, civilDateFromLocalPicker, createAndroidDatePickerValue, createLocalPickerValue } from '../../../utils/local-civil-date-time';
import { MilestoneNavigationControl } from './milestone-visuals';

export function milestonePickerValue(value: CalendarDate, android: boolean): Date {
  const parts = getCalendarDateParts(value);
  return android ? createAndroidDatePickerValue(parts) : createLocalPickerValue(parts);
}

export function milestonePickerDate(value: Date, android: boolean): CalendarDate {
  return createCalendarDateFromParts(android ? civilDateFromAndroidDatePicker(value) : civilDateFromLocalPicker(value));
}

export function MilestoneDateField({ value, birthDate, disabled, onChange }: {
  value: CalendarDate | null; birthDate: CalendarDate; disabled: boolean; onChange(value: CalendarDate): void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Date());
  const android = Platform.OS === 'android';
  const openPicker = () => {
    const selected = value ?? milestonePickerDate(new Date(), false);
    setDraft(milestonePickerValue(selected, android)); setOpen(true);
  };
  const confirm = (date: Date) => {
    if (!disabled) onChange(milestonePickerDate(date, android));
    setOpen(false);
  };
  const picker = open && !disabled ? <DateTimePicker value={draft} mode="date" presentation="dialog" locale="sv_SE"
    minimumDate={milestonePickerValue(birthDate, android)}
    maximumDate={milestonePickerValue(milestonePickerDate(new Date(), false), android)}
    accentColor={lightColors.actionPrimary} themeVariant="light"
    negativeButton={{ label: t('milestones.cancel') }} positiveButton={{ label: t('milestones.confirmDate') }}
    onDismiss={() => setOpen(false)} onValueChange={(_event, date) => android ? confirm(date) : setDraft(date)} /> : null;
  return <View style={styles.field}>
    <AppText variant="label">{t('milestones.date')}</AppText>
    <MilestoneNavigationControl kind="calendar" accessibilityLabel={t('milestones.date')} disabled={disabled}
      onPress={openPicker} label={value ?? t('milestones.selectDate')} />
    {android ? picker : <Modal visible={open && !disabled} transparent onRequestClose={() => setOpen(false)}>
      <View accessibilityViewIsModal style={styles.backdrop}><Card style={styles.field}>
        <AppText variant="headingSmall">{t('milestones.date')}</AppText>{picker}
        <Button onPress={() => confirm(draft)}>{t('milestones.confirmDate')}</Button>
        <Button onPress={() => setOpen(false)} variant="secondary">{t('milestones.cancel')}</Button>
      </Card></View>
    </Modal>}
  </View>;
}

const styles = StyleSheet.create({ field: { gap: spacing.sm }, backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: lightColors.background } });
