import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { lightColors, radii, spacing, typography, shadows } from '@/theme/tokens';
import { lengthMethods } from '../domain/growth-measurement';
import type { GrowthController, GrowthState } from './growth-controller';
import { GrowthDateField } from './growth-date-field';
import type { GrowthField } from './growth-form';
import { GrowthIcon, growthUsesStackedFields } from './growth-visuals';

export function GrowthForm({ state, controller }: { state: GrowthState; controller: GrowthController }) {
  const { t } = useTranslation();
  const { width, fontScale } = useWindowDimensions();
  const stacked = growthUsesStackedFields(width, fontScale);
  if (state.snapshot === null) return null;
  const context = state.snapshot.context;
  const disabled = state.busy || state.pending !== null;
  const error = (field: GrowthField | 'measurements') => {
    const key = state.fields[field];
    return key ? <AppText accessibilityLiveRegion="polite" style={styles.error}>{t(`growth.errors.${key}` as 'growth.errors.date')}</AppText> : null;
  };
  return <Card style={styles.card}>
    <AppText variant="headingMedium">{t(state.editing === null ? 'growth.newMeasurement' : 'growth.editTitle')}</AppText>
    <AppText style={styles.secondary}>{t('growth.description')}</AppText>
    <GrowthDateField key={state.formVersion} value={state.draft.date} birthDate={state.snapshot.child.dateOfBirth}
      disabled={disabled} onChange={date => controller.changeDraft({ date }, context)} />
    {error('date')}
    {(['weight', 'length', 'head'] as const).map(field => <View key={field} style={[styles.measurement, stacked && styles.stacked]}>
      <View style={[styles.measurementIcon, { backgroundColor: field === 'weight' ? lightColors.accentPeach : field === 'length' ? lightColors.accentBlue : lightColors.accentSand }]}><GrowthIcon kind={field} color={field === 'length' ? lightColors.information : field === 'head' ? lightColors.warning : lightColors.actionPrimary} /></View>
      <View style={[styles.fieldContent, stacked && styles.stackedContent]}><AppText nativeID={`growth-${field}-label`} variant="label">{t(`growth.${field}`)}</AppText>
      <TextInput accessibilityLabel={t(`growth.${field}`)} accessibilityLabelledBy={`growth-${field}-label`}
        accessibilityState={{ disabled }} editable={!disabled} keyboardType="decimal-pad"
        inputMode="decimal" autoCorrect={false} autoCapitalize="none"
        value={state.draft[field]} onChangeText={text => controller.changeDraft({ [field]: text }, context)}
        placeholder={t(`growth.examples.${field}`)} placeholderTextColor={lightColors.textSecondary}
        style={[styles.input, state.fields[field] && styles.inputError]} />
      {error(field)}</View>
    </View>)}
    {state.draft.length.trim() !== '' && <View style={styles.field}>
      <AppText variant="label">{t('growth.method')}</AppText>
      <AppText variant="bodySmall" style={styles.secondary}>{t('growth.methodNote')}</AppText>
      <View style={styles.methods}>{lengthMethods.map(method => <Button style={styles.method} key={method} disabled={disabled}
        accessibilityState={{ selected: state.draft.method === method, disabled }}
        onPress={() => controller.changeDraft({ method }, context)}
        variant={state.draft.method === method ? 'primary' : 'secondary'}>{t(`growth.methods.${method}`)}</Button>)}</View>
      {error('method')}
    </View>}
    {error('measurements')}
    <View style={styles.information}><GrowthIcon kind="info" color={lightColors.information} /><AppText variant="bodySmall" style={styles.infoText}>{t('growth.guardrailNote')}</AppText></View>
    <Button style={styles.save} disabled={disabled} accessibilityState={{ busy: state.busy, disabled }} onPress={() => void controller.save()}>
      {t(state.busy ? 'growth.saving' : state.editing === null ? 'growth.save' : 'growth.saveEdit')}
    </Button>
    {state.editing !== null && <Button disabled={disabled} variant="secondary" onPress={controller.cancelEdit}>{t('growth.cancel')}</Button>}
  </Card>;
}
const styles = StyleSheet.create({
  card: { gap: spacing.xl, padding: spacing.xl, borderRadius: radii.xxl, ...shadows.raised },
  measurement: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stacked: { flexDirection: 'column' },
  measurementIcon: { padding: spacing.md, borderRadius: radii.xl },
  fieldContent: { flex: 1, alignSelf: 'stretch', minWidth: 0, gap: spacing.sm },
  stackedContent: { flex: 0 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  method: { flexBasis: 90, flexGrow: 1, paddingHorizontal: spacing.sm },
  information: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: lightColors.accentBlue },
  infoText: { flex: 1, color: lightColors.textSecondary },
  save: { minHeight: 56, borderRadius: radii.xl, paddingVertical: spacing.lg },
  field: { gap: spacing.sm }, secondary: { color: lightColors.textSecondary },
  error: { color: lightColors.error },
  input: { minHeight: 52, padding: spacing.md, borderWidth: 1, borderColor: lightColors.borderSubtle,
    borderRadius: radii.md, backgroundColor: lightColors.surface, color: lightColors.textPrimary, ...typography.body },
  inputError: { borderColor: lightColors.error },
});
