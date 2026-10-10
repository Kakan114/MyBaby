import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { lightColors, radii, shadows, spacing, typography } from '@/theme/tokens';
import { milestoneCategories, milestoneDefinitions, type MilestoneCategory, type MilestoneDefinitionId } from '../domain/milestone-catalog';
import type { MilestoneController, MilestoneState } from './milestone-controller';
import { MilestoneDateField } from './milestone-date-field';
import type { MilestoneField } from './milestone-form';
import { MilestoneIcon } from './milestone-visuals';

const accents: Record<MilestoneCategory, string> = {
  social: lightColors.accentPeach,
  motor: lightColors.accentSage,
  communication: lightColors.accentBlue,
  everyday: lightColors.accentSand,
  teeth: lightColors.accentPeach,
};

export function MilestoneForm({ state, controller }: { state: MilestoneState; controller: MilestoneController }) {
  const { t } = useTranslation();
  if (state.snapshot === null) return null;
  const context = state.snapshot.context;
  const disabled = state.busy || state.pending !== null;
  const error = (field: MilestoneField) => {
    const key = state.fields[field];
    return key ? <AppText accessibilityLiveRegion="polite" style={styles.error}>
      {t(`milestones.errors.${key}` as 'milestones.errors.date')}
    </AppText> : null;
  };
  const select = (definitionId: MilestoneDefinitionId) => controller.selectSubject(definitionId, context);
  return <Card style={styles.form}>
    <View style={styles.heading}>
      <AppText variant="headingMedium">{t(state.editing === null ? 'milestones.newEntry' : 'milestones.editTitle')}</AppText>
      <AppText style={styles.secondary}>{t('milestones.intro')}</AppText>
    </View>
    <View style={styles.safety}><MilestoneIcon kind="info" color={lightColors.information} />
      <AppText variant="bodySmall" style={styles.safetyText}>{t('milestones.safety')}</AppText></View>
    <View style={styles.field}>
      <AppText variant="label">{t('milestones.choose')}</AppText>
      {milestoneCategories.map(category => <View key={category} style={styles.category}>
        <View style={[styles.categoryHeading, { backgroundColor: accents[category] }]}>
          <MilestoneIcon kind={category} />
          <AppText variant="headingSmall" style={styles.categoryTitle}>{t(`milestones.categories.${category}`)}</AppText>
        </View>
        <View style={styles.choices}>{milestoneDefinitions.filter(item => item.category === category).map(item => {
          const selected = state.draft.selection === item.id;
          return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected, disabled }}
            accessibilityLabel={t(item.titleKey)} disabled={disabled} onPress={() => select(item.id)}
            style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && !disabled && styles.choicePressed, disabled && styles.disabled]}>
            <AppText variant="bodyLarge" style={[styles.choiceText, selected && styles.choiceTextSelected]}>{t(item.titleKey)}</AppText>
          </Pressable>;
        })}</View>
      </View>)}
      <Pressable accessibilityRole="button" accessibilityState={{ selected: state.draft.selection === 'custom', disabled }}
        disabled={disabled} onPress={() => controller.selectSubject('custom', context)}
        style={({ pressed }) => [styles.customChoice, state.draft.selection === 'custom' && styles.choiceSelected,
          pressed && !disabled && styles.choicePressed, disabled && styles.disabled]}>
        <View style={styles.customIcon}><MilestoneIcon kind="custom" /></View>
        <AppText variant="bodyLarge" style={[styles.choiceText, state.draft.selection === 'custom' && styles.choiceTextSelected]}>
          {t('milestones.custom')}
        </AppText>
      </Pressable>
      {error('subject')}
    </View>
    {state.draft.selection === 'custom' && <View style={styles.field}>
      <AppText nativeID="milestone-custom-title" variant="label">{t('milestones.customTitle')}</AppText>
      <TextInput accessibilityLabelledBy="milestone-custom-title" accessibilityLabel={t('milestones.customTitle')}
        editable={!disabled} value={state.draft.customTitle}
        onChangeText={customTitle => controller.changeDraft({ customTitle }, context)}
        placeholder={t('milestones.customPlaceholder')} placeholderTextColor={lightColors.textSecondary}
        maxLength={80} style={[styles.input, state.fields.customTitle && styles.inputError]} />
      <AppText variant="caption" style={styles.counter}>{t('milestones.characterCount', { count: Array.from(state.draft.customTitle).length, max: 80 })}</AppText>
      {error('customTitle')}
    </View>}
    <View style={styles.field}>
      <MilestoneDateField key={state.formVersion} value={state.draft.occurredOn}
        birthDate={state.snapshot.child.dateOfBirth} disabled={disabled}
        onChange={occurredOn => controller.changeDraft({ occurredOn }, context)} />
      {error('occurredOn')}
    </View>
    <View style={styles.field}>
      <AppText nativeID="milestone-note-label" variant="label">{t('milestones.note')}</AppText>
      <TextInput accessibilityLabelledBy="milestone-note-label" accessibilityLabel={t('milestones.note')}
        editable={!disabled} value={state.draft.note} multiline textAlignVertical="top"
        onChangeText={note => controller.changeDraft({ note }, context)}
        placeholder={t('milestones.notePlaceholder')} placeholderTextColor={lightColors.textSecondary}
        maxLength={500} style={[styles.input, styles.note, state.fields.note && styles.inputError]} />
      <AppText variant="caption" style={styles.counter}>{t('milestones.characterCount', { count: Array.from(state.draft.note).length, max: 500 })}</AppText>
      {error('note')}
    </View>
    <Button style={styles.save} disabled={disabled} accessibilityState={{ busy: state.busy, disabled }} onPress={() => void controller.save()}>
      {t(state.busy ? 'milestones.saving' : state.editing === null ? 'milestones.save' : 'milestones.saveEdit')}
    </Button>
    {state.editing !== null && <Button disabled={disabled} variant="secondary" onPress={controller.cancelEdit}>{t('milestones.cancel')}</Button>}
  </Card>;
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl, padding: spacing.xl, borderRadius: radii.xxl, ...shadows.raised },
  heading: { gap: spacing.sm }, field: { gap: spacing.sm }, secondary: { color: lightColors.textSecondary },
  safety: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg,
    borderRadius: radii.xl, backgroundColor: lightColors.accentBlue },
  safetyText: { flex: 1, color: lightColors.textSecondary },
  category: { gap: spacing.sm, marginTop: spacing.md },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.full },
  categoryTitle: { flexShrink: 1 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radii.full, borderWidth: 1, borderColor: lightColors.borderSubtle, backgroundColor: lightColors.surface },
  choiceSelected: { borderColor: lightColors.actionPrimary, backgroundColor: lightColors.accentSage },
  choicePressed: { backgroundColor: lightColors.surfaceMuted }, choiceText: { color: lightColors.textPrimary },
  choiceTextSelected: { color: lightColors.actionPrimary, fontWeight: '600' }, disabled: { opacity: 0.5 },
  customChoice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: radii.xl, borderWidth: 1, borderColor: lightColors.borderStrong, backgroundColor: lightColors.surface },
  customIcon: { padding: spacing.sm, borderRadius: radii.md, backgroundColor: lightColors.accentSage },
  input: { minHeight: 52, padding: spacing.md, borderWidth: 1, borderColor: lightColors.borderSubtle,
    borderRadius: radii.md, backgroundColor: lightColors.surface, color: lightColors.textPrimary, ...typography.body },
  note: { minHeight: 112 }, inputError: { borderColor: lightColors.error }, error: { color: lightColors.error },
  counter: { color: lightColors.textSecondary, textAlign: 'right' },
  save: { minHeight: 56, borderRadius: radii.xl, paddingVertical: spacing.lg },
});
