import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import {
  CalendarDateValidationError,
  type CalendarDate,
} from '@/features/children/domain/calendar-date';
import { ChildValidationError } from '@/features/children/domain/child';
import { useChildBootstrap } from '@/features/children/presentation/child-bootstrap-gate';
import { AppRuntimeError } from '@/runtime/app-runtime';
import { useChildrenRuntime } from '@/runtime/app-runtime-provider';
import { lightColors, radii, spacing, typography } from '@/theme/tokens';

import { DateOfBirthField } from './date-of-birth-field';

type FormMode = 'editing' | 'submitting' | 'recovery';

export function FirstChildOnboardingScreen() {
  const { t } = useTranslation();
  const childrenRuntime = useChildrenRuntime();
  const { refreshBootstrap } = useChildBootstrap();
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<CalendarDate | null>(null);
  const [displayNameError, setDisplayNameError] = useState<string>();
  const [dateOfBirthError, setDateOfBirthError] = useState<string>();
  const [mode, setMode] = useState<FormMode>('editing');
  const [recoveryChecking, setRecoveryChecking] = useState(false);
  const mountedRef = useRef(false);
  const creationLockedRef = useRef(false);
  const recoveryRefreshRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (mode !== 'editing' || creationLockedRef.current) {
      return;
    }

    creationLockedRef.current = true;
    setMode('submitting');
    setDisplayNameError(undefined);
    setDateOfBirthError(undefined);
    Keyboard.dismiss();

    try {
      await childrenRuntime.createChild({
        displayName,
        dateOfBirth: dateOfBirth ?? '',
      });

      await refreshBootstrap();
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      if (
        error instanceof ChildValidationError &&
        error.code === 'invalid-display-name'
      ) {
        creationLockedRef.current = false;
        setDisplayNameError(
          t('onboarding.firstChild.errors.invalidDisplayName'),
        );
        setMode('editing');
        return;
      }

      if (
        error instanceof CalendarDateValidationError &&
        error.code === 'invalid-calendar-date'
      ) {
        creationLockedRef.current = false;
        setDateOfBirthError(
          t('onboarding.firstChild.errors.invalidCalendarDate'),
        );
        setMode('editing');
        return;
      }

      if (
        error instanceof ChildValidationError &&
        error.code === 'future-date-of-birth'
      ) {
        creationLockedRef.current = false;
        setDateOfBirthError(
          t('onboarding.firstChild.errors.futureDateOfBirth'),
        );
        setMode('editing');
        return;
      }

      if (
        error instanceof AppRuntimeError &&
        error.code === 'local-data-unavailable'
      ) {
        setMode('recovery');
        return;
      }

      setMode('recovery');
    }
  };

  const handleRecovery = async () => {
    if (mode !== 'recovery' || recoveryRefreshRef.current) {
      return;
    }

    recoveryRefreshRef.current = true;
    setRecoveryChecking(true);

    try {
      await refreshBootstrap();
    } finally {
      if (mountedRef.current) {
        creationLockedRef.current = false;
        recoveryRefreshRef.current = false;
        setRecoveryChecking(false);
        setMode('editing');
      }
    }
  };

  if (mode === 'recovery') {
    return (
      <Screen style={styles.screen}>
        <View style={styles.centeredContent}>
          <Card style={styles.card}>
            <AppText variant="headingMedium">
              {t('onboarding.firstChild.errors.creationFailed')}
            </AppText>
            <AppText style={styles.description}>
              {t('onboarding.firstChild.recovery.description')}
            </AppText>
            <Button
              disabled={recoveryChecking}
              onPress={() => void handleRecovery()}>
              {recoveryChecking
                ? t('bootstrap.checking')
                : t('onboarding.firstChild.recovery.action')}
            </Button>
          </Card>
        </View>
      </Screen>
    );
  }

  const disabled = mode !== 'editing';

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <View style={styles.introduction}>
              <AppText variant="headingLarge">
                {t('onboarding.firstChild.title')}
              </AppText>
              <AppText style={styles.description}>
                {t('onboarding.firstChild.description')}
              </AppText>
            </View>

            <View style={styles.field}>
              <AppText nativeID="first-child-display-name-label" variant="label">
                {t('onboarding.firstChild.displayName.label')}
              </AppText>
              <TextInput
                accessibilityLabel={t(
                  'onboarding.firstChild.displayName.label',
                )}
                autoCapitalize="words"
                accessibilityState={{ disabled }}
                editable={!disabled}
                onChangeText={(value) => {
                  setDisplayName(value);
                  setDisplayNameError(undefined);
                }}
                onSubmitEditing={Keyboard.dismiss}
                placeholder={t(
                  'onboarding.firstChild.displayName.placeholder',
                )}
                placeholderTextColor={lightColors.textSecondary}
                returnKeyType="done"
                style={[
                  styles.input,
                  displayNameError !== undefined && styles.inputError,
                  disabled && styles.disabled,
                ]}
                value={displayName}
              />
              {displayNameError !== undefined && (
                <AppText
                  accessibilityLiveRegion="polite"
                  style={styles.error}
                  variant="bodySmall">
                  {displayNameError}
                </AppText>
              )}
            </View>

            <DateOfBirthField
              disabled={disabled}
              error={dateOfBirthError}
              onChange={(value) => {
                setDateOfBirth(value);
                setDateOfBirthError(undefined);
              }}
              value={dateOfBirth}
            />

            <Button disabled={disabled} onPress={() => void handleSubmit()}>
              {mode === 'submitting'
                ? t('onboarding.firstChild.submitting')
                : t('onboarding.firstChild.submit')}
            </Button>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.none,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    gap: spacing.xl,
  },
  introduction: {
    gap: spacing.sm,
  },
  description: {
    color: lightColors.textSecondary,
  },
  field: {
    gap: spacing.sm,
  },
  input: {
    minHeight: 52,
    borderColor: lightColors.borderSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: lightColors.surface,
    color: lightColors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  inputError: {
    borderColor: lightColors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    color: lightColors.error,
  },
});
