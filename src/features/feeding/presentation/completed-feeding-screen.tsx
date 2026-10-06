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
import { useFeedingRuntime } from '@/runtime/app-runtime-provider';
import { lightColors, radii, spacing, typography } from '@/theme/tokens';

import type { BottleContents } from '../domain/feeding-event';
import {
  createBottleFeedingDetails,
  createBreastFeedingDetails,
} from './feeding-form';
import {
  createFeedingSubmissionController,
  type FeedingSubmissionController,
  type FeedingSubmissionState,
} from './feeding-submission';

type FeedingKind = 'breast' | 'bottle';

const bottleContents: readonly BottleContents[] = [
  'expressed-breast-milk',
  'formula',
  'mixed',
];

export function CompletedFeedingScreen() {
  const { t } = useTranslation();
  const runtime = useFeedingRuntime();
  const [kind, setKind] = useState<FeedingKind>('breast');
  const [leftMinutes, setLeftMinutes] = useState('');
  const [rightMinutes, setRightMinutes] = useState('');
  const [amountMl, setAmountMl] = useState('');
  const [contents, setContents] = useState<BottleContents>('expressed-breast-milk');
  const [submission, setSubmission] = useState<FeedingSubmissionState>({
    status: 'editing',
  });
  const controllerRef = useRef<FeedingSubmissionController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = createFeedingSubmissionController({
      runtime,
      onStateChange: setSubmission,
      onConfirmed: () => {
        setLeftMinutes('');
        setRightMinutes('');
        setAmountMl('');
      },
    });
  }
  const controller = controllerRef.current;

  useEffect(() => () => controller.dispose(), [controller]);

  if (submission.status === 'success') {
    return (
      <Screen style={styles.centeredScreen}>
        <Card style={styles.card}>
          <AppText variant="headingMedium">{t('feeding.success.title')}</AppText>
          <AppText style={styles.description}>
            {t('feeding.success.description')}
          </AppText>
          <Button onPress={() => controller.startAnother()}>
            {t('feeding.success.another')}
          </Button>
        </Card>
      </Screen>
    );
  }

  if (submission.status === 'uncertain') {
    return (
      <Screen style={styles.centeredScreen}>
        <Card style={styles.card}>
          <AppText variant="headingMedium">{t('feeding.uncertain.title')}</AppText>
          <AppText style={styles.description}>
            {t('feeding.uncertain.description')}
          </AppText>
        </Card>
      </Screen>
    );
  }

  const disabled = submission.status === 'saving';
  const validation = submission.status === 'editing'
    ? submission.validation
    : undefined;

  const update = (setter: (value: string) => void, value: string) => {
    setter(value);
    controller.clearValidation();
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.introduction}>
            <AppText variant="headingLarge">{t('feeding.title')}</AppText>
            <AppText style={styles.description}>{t('feeding.description')}</AppText>
          </View>

          <Card style={styles.card}>
            <AppText variant="label">{t('feeding.kind.label')}</AppText>
            <View style={styles.choiceRow}>
              <Button
                accessibilityState={{ selected: kind === 'breast' }}
                disabled={disabled}
                onPress={() => {
                  setKind('breast');
                  controller.clearValidation();
                }}
                style={styles.choice}
                variant={kind === 'breast' ? 'primary' : 'secondary'}>
                {t('feeding.kind.breast')}
              </Button>
              <Button
                accessibilityState={{ selected: kind === 'bottle' }}
                disabled={disabled}
                onPress={() => {
                  setKind('bottle');
                  controller.clearValidation();
                }}
                style={styles.choice}
                variant={kind === 'bottle' ? 'primary' : 'secondary'}>
                {t('feeding.kind.bottle')}
              </Button>
            </View>

            {kind === 'breast' ? (
              <View style={styles.fields}>
                <DurationInput
                  disabled={disabled}
                  label={t('feeding.breast.left')}
                  onChange={(value) => update(setLeftMinutes, value)}
                  value={leftMinutes}
                />
                <DurationInput
                  disabled={disabled}
                  label={t('feeding.breast.right')}
                  onChange={(value) => update(setRightMinutes, value)}
                  value={rightMinutes}
                />
                {validation === 'duration' && (
                  <ValidationMessage text={t('feeding.errors.duration')} />
                )}
              </View>
            ) : (
              <View style={styles.fields}>
                <View style={styles.field}>
                  <AppText variant="label">{t('feeding.bottle.amount')}</AppText>
                  <TextInput
                    accessibilityLabel={t('feeding.bottle.amount')}
                    editable={!disabled}
                    inputMode="decimal"
                    onChangeText={(value) => update(setAmountMl, value)}
                    placeholder={t('feeding.bottle.amountPlaceholder')}
                    placeholderTextColor={lightColors.textSecondary}
                    style={[styles.input, validation === 'amount' && styles.inputError]}
                    value={amountMl}
                  />
                  {validation === 'amount' && (
                    <ValidationMessage text={t('feeding.errors.amount')} />
                  )}
                </View>
                <View style={styles.field}>
                  <AppText variant="label">{t('feeding.bottle.contents.label')}</AppText>
                  {bottleContents.map((value) => (
                    <Button
                      accessibilityState={{ selected: contents === value }}
                      disabled={disabled}
                      key={value}
                      onPress={() => setContents(value)}
                      variant={contents === value ? 'primary' : 'secondary'}>
                      {t(`feeding.bottle.contents.${value}`)}
                    </Button>
                  ))}
                  <AppText style={styles.hint} variant="bodySmall">
                    {t('feeding.bottle.mixedHint')}
                  </AppText>
                </View>
              </View>
            )}

            <Button
              disabled={disabled}
              onPress={() => {
                Keyboard.dismiss();
                void controller.submit(() => kind === 'breast'
                  ? createBreastFeedingDetails(leftMinutes, rightMinutes)
                  : createBottleFeedingDetails(amountMl, contents));
              }}>
              {disabled ? t('feeding.saving') : t('feeding.save')}
            </Button>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function DurationInput({
  disabled,
  label,
  onChange,
  value,
}: Readonly<{
  disabled: boolean;
  label: string;
  onChange(value: string): void;
  value: string;
}>) {
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        editable={!disabled}
        inputMode="decimal"
        onChangeText={onChange}
        placeholder="0"
        placeholderTextColor={lightColors.textSecondary}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function ValidationMessage({ text }: Readonly<{ text: string }>) {
  return (
    <AppText accessibilityLiveRegion="polite" style={styles.error} variant="bodySmall">
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none },
  centeredScreen: { justifyContent: 'center', gap: spacing.lg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, gap: spacing.lg, padding: spacing.lg },
  introduction: { gap: spacing.sm },
  description: { color: lightColors.textSecondary },
  card: { gap: spacing.xl },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1 },
  fields: { gap: spacing.lg },
  field: { gap: spacing.sm },
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
  inputError: { borderColor: lightColors.error },
  error: { color: lightColors.error },
  hint: { color: lightColors.textSecondary },
});
