import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { lightColors, spacing } from '@/theme/tokens';

import { useBreastfeedingTimer } from './breastfeeding-timer-provider';
import {
  getTimerDiscardCopyVariant,
  requestTimerDiscardConfirmation,
} from './breastfeeding-timer-discard-confirmation';

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function BreastfeedingTimer({ onManual }: Readonly<{ onManual(): void }>) {
  const { t } = useTranslation();
  const timer = useBreastfeedingTimer();
  const { state } = timer;

  if (state.status === 'loading') {
    return <AppText>{t('feeding.timer.loading')}</AppText>;
  }

  if (state.status === 'error') {
    return (
      <View style={styles.section}>
        <AppText variant="headingSmall">{t('feeding.timer.error.title')}</AppText>
        <AppText style={styles.description}>{t('feeding.timer.error.description')}</AppText>
        <Button onPress={() => void timer.refresh()}>{t('bootstrap.retry')}</Button>
        <Button onPress={onManual} variant="secondary">
          {t('feeding.timer.manual')}
        </Button>
      </View>
    );
  }

  if (state.status === 'saved') {
    return (
      <View style={styles.section}>
        <AppText variant="headingSmall">{t('feeding.success.title')}</AppText>
        <AppText style={styles.description}>{t('feeding.success.description')}</AppText>
        <Button onPress={() => void timer.refresh()}>{t('feeding.success.another')}</Button>
      </View>
    );
  }

  if (state.status === 'idle') {
    return (
      <View style={styles.section}>
        <AppText variant="headingSmall">{t('feeding.timer.title')}</AppText>
        <View style={styles.row}>
          <Button style={styles.flex} onPress={() => void timer.start('left')}>
            {t('feeding.timer.startLeft')}
          </Button>
          <Button style={styles.flex} onPress={() => void timer.start('right')}>
            {t('feeding.timer.startRight')}
          </Button>
        </View>
        <Button onPress={onManual} variant="secondary">
          {t('feeding.timer.manual')}
        </Button>
      </View>
    );
  }

  const session = state.runtimeState.session;
  const disabled = state.pending || state.runtimeState.status === 'active-child-mismatch';
  const issue = state.issue;
  const discardCopyVariant = getTimerDiscardCopyVariant(session.status);
  const confirmDiscard = () => requestTimerDiscardConfirmation(
    (title, message, buttons) => Alert.alert(title, message, [...buttons]),
    {
      title: t(`feeding.timer.discard.confirmation.${discardCopyVariant}.title`),
      message: t(`feeding.timer.discard.confirmation.${discardCopyVariant}.message`),
      continueLabel: t(`feeding.timer.discard.confirmation.${discardCopyVariant}.cancel`),
      discardLabel: t(`feeding.timer.discard.confirmation.${discardCopyVariant}.confirm`),
    },
    () => void timer.discard(),
  );

  return (
    <View style={styles.section}>
      <AppText variant="headingSmall">
        {session.status === 'running'
          ? t('feeding.timer.running', {
              side: t(`feeding.timer.side.${session.activeSide}`),
            })
          : session.status === 'paused'
            ? t('feeding.timer.paused')
            : t('feeding.timer.finished')}
      </AppText>
      <View style={styles.totals}>
        <Duration label={t('feeding.timer.side.left')} value={state.projected.leftMs} />
        <Duration label={t('feeding.timer.side.right')} value={state.projected.rightMs} />
      </View>

      {issue !== undefined && (
        <View style={styles.warning}>
          <AppText variant="label">{t(`feeding.timer.issue.${issue}.title`)}</AppText>
          <AppText style={styles.description} variant="bodySmall">
            {t(`feeding.timer.issue.${issue}.description`)}
          </AppText>
        </View>
      )}

      {session.status === 'running' && (
        <>
          <Button disabled={disabled} onPress={() => void timer.pause()}>
            {t('feeding.timer.pause')}
          </Button>
          <Button disabled={disabled} onPress={() => void timer.switchSide()} variant="secondary">
            {t('feeding.timer.switchSide')}
          </Button>
          <Button disabled={disabled} onPress={() => void timer.finish()} variant="secondary">
            {t('feeding.timer.finish')}
          </Button>
          <Button disabled={disabled} onPress={confirmDiscard} variant="secondary">
            {t('feeding.timer.discard.active')}
          </Button>
        </>
      )}

      {session.status === 'paused' && (
        <>
          <AppText style={styles.description}>
            {t('feeding.timer.resumeSide', {
              side: t(`feeding.timer.side.${session.resumeSide}`),
            })}
          </AppText>
          <Button disabled={disabled} onPress={() => void timer.resume()}>
            {t('feeding.timer.resume')}
          </Button>
          <Button disabled={disabled} onPress={() => void timer.switchSide()} variant="secondary">
            {t('feeding.timer.changeResumeSide')}
          </Button>
          <Button disabled={disabled} onPress={() => void timer.finish()} variant="secondary">
            {t('feeding.timer.finish')}
          </Button>
          <Button disabled={disabled} onPress={confirmDiscard} variant="secondary">
            {t('feeding.timer.discard.active')}
          </Button>
        </>
      )}

      {session.status === 'finished' && (
        <>
          <Button disabled={disabled} onPress={() => void timer.save()}>
            {state.pending ? t('feeding.saving') : t('feeding.timer.save')}
          </Button>
          <Button disabled={disabled} onPress={confirmDiscard} variant="secondary">
            {t('feeding.timer.discard.finished')}
          </Button>
        </>
      )}

      {(issue === 'clock' || issue === 'ownership' || issue === 'duration-too-short') && (
        <Button onPress={onManual} variant="secondary">
          {t('feeding.timer.manual')}
        </Button>
      )}
    </View>
  );
}

function Duration({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <View style={styles.duration}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="headingMedium">{formatDuration(value)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  totals: { flexDirection: 'row', gap: spacing.lg },
  duration: { flex: 1, gap: spacing.xs },
  description: { color: lightColors.textSecondary },
  warning: {
    backgroundColor: lightColors.accentSand,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
