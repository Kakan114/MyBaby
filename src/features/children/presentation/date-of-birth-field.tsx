import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  getCalendarDateParts,
  type CalendarDate,
} from '@/features/children/domain/calendar-date';
import { lightColors, radii, spacing } from '@/theme/tokens';

import {
  createCalendarDateFromAndroidMaterialPickerDate,
  createCalendarDateFromLocalPickerDate,
  createAndroidMaterialPickerDateFromCalendarDate,
} from './onboarding-date';

type DateOfBirthFieldProps = Readonly<{
  disabled: boolean;
  error?: string;
  onChange(value: CalendarDate): void;
  value: CalendarDate | null;
}>;

function localNoonToday(): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

function pickerDateFromCalendarDate(value: CalendarDate): Date {
  const { year, month, day } = getCalendarDateParts(value);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function DateOfBirthField({
  disabled,
  error,
  onChange,
  value,
}: DateOfBirthFieldProps) {
  const { t } = useTranslation();
  const maximumDate = useMemo(localNoonToday, []);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(maximumDate);

  const openPicker = () => {
    if (disabled) {
      return;
    }

    if (Platform.OS === 'android') {
      const calendarDate =
        value ?? createCalendarDateFromLocalPickerDate(maximumDate);
      setDraftDate(createAndroidMaterialPickerDateFromCalendarDate(calendarDate));
    } else {
      setDraftDate(
        value === null ? maximumDate : pickerDateFromCalendarDate(value)
      );
    }
    setPickerVisible(true);
  };

  const cancelPicker = () => {
    setPickerVisible(false);
  };

  const confirmIosDate = () => {
    onChange(createCalendarDateFromLocalPickerDate(draftDate));
    setPickerVisible(false);
  };

  return (
    <View style={styles.field}>
      <AppText nativeID="first-child-date-of-birth-label" variant="label">
        {t('onboarding.firstChild.dateOfBirth.label')}
      </AppText>

      <Pressable
        accessibilityLabel={t('onboarding.firstChild.dateOfBirth.label')}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.select,
          error !== undefined && styles.selectError,
          pressed && !disabled && styles.selectPressed,
          disabled && styles.disabled,
        ]}>
        <AppText style={value === null ? styles.placeholder : undefined}>
          {value ?? t('onboarding.firstChild.dateOfBirth.select')}
        </AppText>
        {value !== null && (
          <AppText style={styles.change} variant="label">
            {t('onboarding.firstChild.dateOfBirth.change')}
          </AppText>
        )}
      </Pressable>

      {error !== undefined && (
        <AppText
          accessibilityLiveRegion="polite"
          style={styles.error}
          variant="bodySmall">
          {error}
        </AppText>
      )}

      {pickerVisible && Platform.OS === 'android' && (
        <DateTimePicker
          accentColor={lightColors.actionPrimary}
          maximumDate={maximumDate}
          mode="date"
          negativeButton={{
            label: t('onboarding.firstChild.dateOfBirth.cancel'),
          }}
          onDismiss={cancelPicker}
          onValueChange={(_event, date) => {
            onChange(createCalendarDateFromAndroidMaterialPickerDate(date));
            setPickerVisible(false);
          }}
          positiveButton={{
            label: t('onboarding.firstChild.dateOfBirth.confirm'),
          }}
          presentation="dialog"
          value={draftDate}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          animationType="fade"
          onRequestClose={cancelPicker}
          presentationStyle="overFullScreen"
          transparent
          visible={pickerVisible}>
          <View accessibilityViewIsModal style={styles.modalBackdrop}>
            <Card style={styles.modalCard}>
              <AppText variant="headingSmall">
                {t('onboarding.firstChild.dateOfBirth.label')}
              </AppText>
              <DateTimePicker
                accentColor={lightColors.actionPrimary}
                display="spinner"
                maximumDate={maximumDate}
                mode="date"
                onValueChange={(_event, date) => setDraftDate(date)}
                themeVariant="light"
                value={draftDate}
              />
              <View style={styles.modalActions}>
                <Button
                  onPress={cancelPicker}
                  style={styles.modalAction}
                  variant="secondary">
                  {t('onboarding.firstChild.dateOfBirth.cancel')}
                </Button>
                <Button onPress={confirmIosDate} style={styles.modalAction}>
                  {t('onboarding.firstChild.dateOfBirth.confirm')}
                </Button>
              </View>
            </Card>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  select: {
    minHeight: 52,
    borderColor: lightColors.borderSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: lightColors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectPressed: {
    backgroundColor: lightColors.surfaceMuted,
  },
  selectError: {
    borderColor: lightColors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  placeholder: {
    color: lightColors.textSecondary,
  },
  change: {
    color: lightColors.actionPrimary,
  },
  error: {
    color: lightColors.error,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(38, 48, 42, 0.35)',
  },
  modalCard: {
    gap: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalAction: {
    flex: 1,
  },
});
