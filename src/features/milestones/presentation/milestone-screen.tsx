import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, radii, spacing } from '@/theme/tokens';
import { useChildBootstrap } from '../../children/presentation/child-bootstrap-gate';
import { formatChildAge } from '../../children/presentation/format-child-age';
import { milestoneDefinitions, type MilestoneCategory } from '../domain/milestone-catalog';
import type { MilestoneEntry } from '../domain/milestone-entry';
import { MilestoneForm } from './milestone-form-view';
import { formatMilestoneDate } from './milestone-format';
import { MilestoneIcon, MilestoneNavigationControl } from './milestone-visuals';
import { useMilestones } from './use-milestones';

const accents: Record<MilestoneCategory | 'custom', string> = {
  social: lightColors.accentPeach, motor: lightColors.accentSage, communication: lightColors.accentBlue,
  everyday: lightColors.accentSand, teeth: lightColors.accentPeach, custom: lightColors.accentSage,
};

function categoryFor(entry: MilestoneEntry): MilestoneCategory | 'custom' {
  if (entry.subject.kind === 'custom') return 'custom';
  const definitionId = entry.subject.definitionId;
  return milestoneDefinitions.find(item => item.id === definitionId)!.category;
}

export function MilestoneScreen({ mode }: { mode: 'recording' | 'history' }) {
  const { state, controller } = useMilestones();
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshBootstrap } = useChildBootstrap();
  const locked = state.busy || state.pending !== null;
  const confirmDelete = (entry: MilestoneEntry) => {
    const confirm = controller.prepareDeleteConfirmation(entry);
    if (confirm === null) return;
    Alert.alert(t('milestones.deleteTitle'), t('milestones.deleteDescription'), [
      { text: t('milestones.cancel'), style: 'cancel' },
      { text: t('milestones.deleteConfirm'), style: 'destructive', onPress: () => void confirm() },
    ]);
  };
  const feedback = state.feedback !== null && <AppText accessibilityLiveRegion="polite" style={styles.secondary}>
    {t(`milestones.feedback.${state.feedback}` as 'milestones.feedback.failure')}
  </AppText>;
  return <Screen style={styles.screen}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        {state.summary !== null && <>
          <View style={styles.profileAccent}><MilestoneIcon kind="profile" /></View>
          <View style={styles.profileText}><AppText variant="headingLarge">{state.summary.child.displayName}</AppText>
            <AppText style={styles.secondary}>{formatChildAge(state.summary.age, t)}</AppText></View>
        </>}
      </View>
      {feedback}
      {state.status === 'ready' && (state.feedback === 'conflict' || state.feedback === 'notFound') &&
        <Button onPress={() => { controller.cancelEdit(); void controller.refresh(); }}>{t('milestones.retry')}</Button>}
      {state.pending !== null && <Card style={styles.section}>
        <AppText variant="headingSmall">{t('milestones.uncertainTitle')}</AppText>
        <AppText>{t(state.snapshot?.context.childId === state.pending.attempt.childId
          ? 'milestones.uncertainDescription' : 'milestones.pendingOtherChild')}</AppText>
        <Button disabled={state.busy || state.snapshot?.context.childId !== state.pending.attempt.childId}
          onPress={() => void controller.checkStatus()}>{t('milestones.checkStatus')}</Button>
      </Card>}
      {state.status === 'loading' && <View style={styles.section}><ActivityIndicator color={lightColors.actionPrimary} />
        <AppText>{t('milestones.loading')}</AppText></View>}
      {state.status === 'error' && <Card style={styles.section}><AppText>{t('milestones.readError')}</AppText>
        <Button onPress={() => void controller.refresh()}>{t('milestones.retry')}</Button></Card>}
      {state.status === 'missing' && <Card style={styles.section}><AppText>{t('milestones.missing')}</AppText>
        <Button onPress={() => void refreshBootstrap()}>{t('milestones.recover')}</Button></Card>}
      {state.status === 'ready' && <>
        {mode === 'recording' ? <MilestoneForm state={state} controller={controller} /> : <>
          {state.editing !== null && <MilestoneForm state={state} controller={controller} />}
          {state.snapshot!.value.items.length === 0 ? <Card><AppText style={styles.secondary}>{t('milestones.empty')}</AppText></Card> :
            state.snapshot!.value.items.map((entry, index, entries) => {
              const category = categoryFor(entry);
              const showDate = index === 0 || entries[index - 1].occurredOn !== entry.occurredOn;
              const title = entry.subject.kind === 'custom' ? entry.subject.title : t(`milestones.catalog.${entry.subject.definitionId}`);
              return <View key={entry.id} style={styles.timelineGroup}>
                {showDate && <AppText variant="label" style={styles.dateHeading}>{formatMilestoneDate(entry.occurredOn)}</AppText>}
                <View style={styles.timelineRow}>
                  <View style={[styles.timelineIcon, { backgroundColor: accents[category] }]}><MilestoneIcon kind={category} /></View>
                  <Card style={styles.entry}>
                    <AppText variant="headingSmall">{title}</AppText>
                    <AppText variant="bodySmall" style={styles.secondary}>{t(category === 'custom'
                      ? 'milestones.customCategory' : `milestones.categories.${category}`)}</AppText>
                    {entry.note !== null && <AppText>{entry.note}</AppText>}
                    <View style={styles.actions}>
                      <Button accessibilityLabel={t('milestones.editAccessibility', { title })} disabled={locked}
                        variant="secondary" onPress={() => controller.edit(entry)}>{t('milestones.edit')}</Button>
                      <Button accessibilityLabel={t('milestones.deleteAccessibility', { title })} disabled={locked}
                        variant="secondary" onPress={() => confirmDelete(entry)}>{t('milestones.delete')}</Button>
                    </View>
                  </Card>
                </View>
              </View>;
            })}
          {state.pageError && <AppText accessibilityLiveRegion="polite">{t('milestones.pageError')}</AppText>}
          {state.snapshot!.value.nextCursor !== null && <Button disabled={locked || state.paging || state.refreshing}
            onPress={() => void controller.loadMore()} variant="secondary">
            {t(state.paging ? 'milestones.loadingMore' : 'milestones.loadMore')}
          </Button>}
        </>}
        <MilestoneNavigationControl kind="history" disabled={state.busy}
          onPress={() => router.push(mode === 'recording' ? '/milestone-history' : '/milestones')}
          label={t(mode === 'recording' ? 'milestones.historyOpen' : 'milestones.open')} />
      </>}
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none }, flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.sm },
  profileAccent: { padding: spacing.lg, borderRadius: radii.full, backgroundColor: lightColors.accentPeach },
  profileText: { flex: 1, minWidth: 0, gap: spacing.xs }, section: { gap: spacing.md },
  secondary: { color: lightColors.textSecondary }, timelineGroup: { gap: spacing.sm },
  dateHeading: { color: lightColors.textSecondary, marginTop: spacing.sm },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  timelineIcon: { padding: spacing.md, borderRadius: radii.full },
  entry: { flex: 1, minWidth: 0, gap: spacing.sm, borderRadius: radii.xl },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
