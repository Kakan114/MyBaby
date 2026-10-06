import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

import { useActiveChildSelectionRecovery } from './use-active-child-selection-recovery';

type ActiveChildSelectionRecoveryScreenProps = Readonly<{
  refreshBootstrap(): Promise<void>;
}>;

export function ActiveChildSelectionRecoveryScreen({
  refreshBootstrap,
}: ActiveChildSelectionRecoveryScreenProps) {
  const { t } = useTranslation();
  const { loadChildren, recheckBootstrap, selectChild, state } =
    useActiveChildSelectionRecovery(refreshBootstrap);

  if (state.status === 'loading') {
    return (
      <Screen style={styles.centeredScreen}>
        <ActivityIndicator color={lightColors.actionPrimary} size="large" />
        <AppText>{t('bootstrap.activeSelection.loading')}</AppText>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <RecoveryCard
        action={() => void loadChildren()}
        actionLabel={t('bootstrap.retry')}
        description={t('bootstrap.activeSelection.error.description')}
        title={t('bootstrap.activeSelection.error.title')}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <RecoveryCard
        action={() => void recheckBootstrap()}
        actionLabel={t('bootstrap.activeSelection.recheck')}
        description={t('bootstrap.activeSelection.empty.description')}
        title={t('bootstrap.activeSelection.empty.title')}
      />
    );
  }

  if (state.status === 'uncertain' || state.status === 'checking') {
    return (
      <RecoveryCard
        action={() => void recheckBootstrap()}
        actionLabel={
          state.status === 'checking'
            ? t('bootstrap.checking')
            : t('bootstrap.activeSelection.recheck')
        }
        description={t('bootstrap.activeSelection.uncertain.description')}
        disabled={state.status === 'checking'}
        title={t('bootstrap.activeSelection.uncertain.title')}
      />
    );
  }

  const selectingId =
    state.status === 'selecting' ? state.selectedChildId : null;

  return (
    <Screen style={styles.screen}>
      <View style={styles.introduction}>
        <AppText variant="headingLarge">
          {t('bootstrap.activeSelection.title')}
        </AppText>
        <AppText style={styles.description}>
          {t('bootstrap.activeSelection.description')}
        </AppText>
      </View>

      <View style={styles.children}>
        {state.children.map((child) => (
          <Card key={child.id} style={styles.childCard}>
            <AppText variant="headingMedium">{child.displayName}</AppText>
            <Button
              accessibilityLabel={t(
                'bootstrap.activeSelection.selectAccessibility',
                { name: child.displayName },
              )}
              disabled={state.status === 'selecting'}
              onPress={() => void selectChild(child.id)}>
              {selectingId === child.id
                ? t('bootstrap.activeSelection.selecting')
                : t('bootstrap.activeSelection.select')}
            </Button>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

type RecoveryCardProps = Readonly<{
  action(): void;
  actionLabel: string;
  description: string;
  disabled?: boolean;
  title: string;
}>;

function RecoveryCard({
  action,
  actionLabel,
  description,
  disabled = false,
  title,
}: RecoveryCardProps) {
  return (
    <Screen style={styles.centeredScreen}>
      <Card style={styles.recoveryCard}>
        <AppText variant="headingMedium">{title}</AppText>
        <AppText style={styles.description}>{description}</AppText>
        <Button disabled={disabled} onPress={action}>
          {actionLabel}
        </Button>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.xl,
  },
  centeredScreen: {
    justifyContent: 'center',
    gap: spacing.md,
  },
  introduction: {
    gap: spacing.sm,
  },
  children: {
    gap: spacing.md,
  },
  childCard: {
    gap: spacing.md,
  },
  recoveryCard: {
    gap: spacing.lg,
  },
  description: {
    color: lightColors.textSecondary,
  },
});
