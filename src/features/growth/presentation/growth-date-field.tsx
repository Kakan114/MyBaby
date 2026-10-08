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

export function growthPickerValue(value: CalendarDate, android: boolean): Date {
  const parts = getCalendarDateParts(value);
  return android ? createAndroidDatePickerValue(parts) : createLocalPickerValue(parts);
}
export function growthPickerDate(value: Date, android: boolean): CalendarDate {
  return createCalendarDateFromParts(android ? civilDateFromAndroidDatePicker(value) : civilDateFromLocalPicker(value));
}
export function GrowthDateField({ value, birthDate, disabled, onChange }: {
  value: CalendarDate | null; birthDate: CalendarDate; disabled: boolean; onChange(value: CalendarDate): void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Date());
  const android = Platform.OS === 'android';
  const openPicker = () => {
    const selected = value ?? growthPickerDate(new Date(), false);
    setDraft(growthPickerValue(selected, android)); setOpen(true);
  };
  const confirm = (date: Date) => {
    if (!disabled) onChange(growthPickerDate(date, android));
    setOpen(false);
  };
  const picker = open && !disabled ? <DateTimePicker
    value={draft} mode="date" presentation="dialog" locale="sv_SE"
    minimumDate={growthPickerValue(birthDate, android)}
    maximumDate={growthPickerValue(growthPickerDate(new Date(), false), android)}
    accentColor={lightColors.actionPrimary} themeVariant="light"
    negativeButton={{ label: t('growth.cancel') }} positiveButton={{ label: t('growth.confirmDate') }}
    onDismiss={() => setOpen(false)}
    onValueChange={(_event, date) => android ? confirm(date) : setDraft(date)} /> : null;
  return <View style={styles.field}>
    <AppText variant="label">{t('growth.date')}</AppText>
    <Button accessibilityLabel={t('growth.date')} disabled={disabled} onPress={openPicker} variant="secondary">
      {value ?? t('growth.selectDate')}
    </Button>
    {android ? picker : <Modal visible={open && !disabled} transparent onRequestClose={() => setOpen(false)}>
      <View accessibilityViewIsModal style={styles.backdrop}><Card style={styles.field}>
        <AppText variant="headingSmall">{t('growth.date')}</AppText>{picker}
        <Button onPress={() => confirm(draft)}>{t('growth.confirmDate')}</Button>
        <Button onPress={() => setOpen(false)} variant="secondary">{t('growth.cancel')}</Button>
      </Card></View>
    </Modal>}
  </View>;
}
const styles = StyleSheet.create({
  field: { gap: spacing.sm }, backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: lightColors.background },
});
