import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';
import { useChildBootstrap } from '../../children/presentation/child-bootstrap-gate';
import { formatChildAge } from '../../children/presentation/format-child-age';
import { formatWeightKg, formatLengthCm, formatHeadCircumferenceCm } from '../domain/growth-units';
import type { GrowthMeasurement } from '../domain/growth-measurement';
import { GrowthForm } from './growth-form-view';
import { useGrowth } from './use-growth';

export function GrowthScreen({ mode }: { mode: 'recording' | 'history' }) {
  const { state, controller } = useGrowth();
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshBootstrap } = useChildBootstrap();
  const locked = state.busy || state.pending !== null;
  const confirmDelete = (measurement: GrowthMeasurement) => {
    const confirm = controller.prepareDeleteConfirmation(measurement);
    if (confirm === null) return;
    Alert.alert(
      t('growth.deleteTitle'), t('growth.deleteDescription'),
      [{ text: t('growth.cancel'), style: 'cancel' },
        { text: t('growth.deleteConfirm'), style: 'destructive', onPress: () => void confirm() }],
    );
  };
  const feedback = state.feedback !== null && <AppText accessibilityLiveRegion="polite" style={styles.secondary}>
    {t(`growth.feedback.${state.feedback}` as 'growth.feedback.failure')}
  </AppText>;
  return <Screen style={styles.screen}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <AppText variant="headingLarge">{t(mode === 'recording' ? 'growth.title' : 'growth.historyTitle')}</AppText>
        {state.summary !== null && <><AppText variant="headingMedium">{state.summary.child.displayName}</AppText>
          <AppText style={styles.secondary}>{formatChildAge(state.summary.age, t)}</AppText></>}
      </View>
      {feedback}
      {state.status === 'ready' && (state.feedback === 'conflict' || state.feedback === 'notFound') &&
        <Button onPress={() => { controller.cancelEdit(); void controller.refresh(); }}>{t('growth.retry')}</Button>}
      {state.pending !== null && <Card style={styles.section}>
        <AppText variant="headingSmall">{t('growth.uncertainTitle')}</AppText>
        <AppText>{t(state.snapshot?.context.childId === state.pending.attempt.childId ? 'growth.uncertainDescription' : 'growth.pendingOtherChild')}</AppText>
        <Button disabled={state.busy || state.snapshot?.context.childId !== state.pending.attempt.childId}
          onPress={() => void controller.checkStatus()}>{t('growth.checkStatus')}</Button>
      </Card>}
      {state.status === 'loading' && <View style={styles.section}><ActivityIndicator color={lightColors.actionPrimary} />
        <AppText>{t('growth.loading')}</AppText></View>}
      {state.status === 'error' && <Card style={styles.section}>
        <AppText>{t('growth.readError')}</AppText><Button onPress={() => void controller.refresh()}>{t('growth.retry')}</Button>
      </Card>}
      {state.status === 'missing' && <Card style={styles.section}>
        <AppText>{t('growth.missing')}</AppText><Button onPress={() => void refreshBootstrap()}>{t('growth.recover')}</Button>
      </Card>}
      {state.status === 'ready' && <>
        {mode === 'recording' ? <GrowthForm state={state} controller={controller} /> : <>
          {state.editing !== null && <GrowthForm state={state} controller={controller} />}
          {state.snapshot!.value.items.length === 0 ? <Card><AppText style={styles.secondary}>{t('growth.empty')}</AppText></Card> :
            state.snapshot!.value.items.map(measurement => <Card key={measurement.id} style={styles.section}>
              <AppText variant="headingSmall">{measurement.measuredOn}</AppText>
              {measurement.weightGrams !== null && <AppText>{t('growth.weightValue', { value: formatWeightKg(measurement.weightGrams) })}</AppText>}
              {measurement.lengthMm !== null && <AppText>{t('growth.lengthValue', { value: formatLengthCm(measurement.lengthMm) })}</AppText>}
              {measurement.headCircumferenceMm !== null && <AppText>{t('growth.headValue', { value: formatHeadCircumferenceCm(measurement.headCircumferenceMm) })}</AppText>}
              {measurement.lengthMethod !== null && <AppText style={styles.secondary}>{t('growth.methodValue', { method: t(`growth.methods.${measurement.lengthMethod}`) })}</AppText>}
              <Button accessibilityLabel={t('growth.editAccessibility', { date: measurement.measuredOn })} disabled={locked}
                variant="secondary" onPress={() => controller.edit(measurement)}>{t('growth.edit')}</Button>
              <Button accessibilityLabel={t('growth.deleteAccessibility', { date: measurement.measuredOn })} disabled={locked}
                variant="secondary" onPress={() => confirmDelete(measurement)}>{t('growth.delete')}</Button>
            </Card>)}
          {state.pageError && <AppText accessibilityLiveRegion="polite">{t('growth.pageError')}</AppText>}
          {state.snapshot!.value.nextCursor !== null && <Button disabled={locked || state.paging || state.refreshing}
            onPress={() => void controller.loadMore()} variant="secondary">{t(state.paging ? 'growth.loadingMore' : 'growth.loadMore')}</Button>}
        </>}
        <Button variant="secondary" disabled={state.busy}
          onPress={() => router.push(mode === 'recording' ? '/growth-history' : '/growth')}>
          {t(mode === 'recording' ? 'growth.historyOpen' : 'growth.open')}
        </Button>
      </>}
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none }, flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.md }, secondary: { color: lightColors.textSecondary },
});
