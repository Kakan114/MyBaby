import { StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { lightColors, radii, spacing, typography } from '@/theme/tokens';
import { lengthMethods } from '../domain/growth-measurement';
import type { GrowthController, GrowthState } from './growth-controller';
import { GrowthDateField } from './growth-date-field';
import type { GrowthField } from './growth-form';

export function GrowthForm({ state, controller }: { state: GrowthState; controller: GrowthController }) {
  const { t } = useTranslation();
  if (state.snapshot === null) return null;
  const context = state.snapshot.context;
  const disabled = state.busy || state.pending !== null;
  const error = (field: GrowthField | 'measurements') => {
    const key = state.fields[field];
    return key ? <AppText accessibilityLiveRegion="polite" style={styles.error}>{t(`growth.errors.${key}` as 'growth.errors.date')}</AppText> : null;
  };
  return <Card style={styles.card}>
    <AppText variant="headingMedium">{t(state.editing === null ? 'growth.title' : 'growth.editTitle')}</AppText>
    <AppText style={styles.secondary}>{t('growth.description')}</AppText>
    <GrowthDateField key={state.formVersion} value={state.draft.date} birthDate={state.snapshot.child.dateOfBirth}
      disabled={disabled} onChange={date => controller.changeDraft({ date }, context)} />
    {error('date')}
    {(['weight', 'length', 'head'] as const).map(field => <View key={field} style={styles.field}>
      <AppText nativeID={`growth-${field}-label`} variant="label">{t(`growth.${field}`)}</AppText>
      <TextInput accessibilityLabel={t(`growth.${field}`)} accessibilityLabelledBy={`growth-${field}-label`}
        accessibilityState={{ disabled }} editable={!disabled} keyboardType="decimal-pad"
        inputMode="decimal" autoCorrect={false} autoCapitalize="none"
        value={state.draft[field]} onChangeText={text => controller.changeDraft({ [field]: text }, context)}
        style={[styles.input, state.fields[field] && styles.inputError]} />
      {error(field)}
    </View>)}
    {state.draft.length.trim() !== '' && <View style={styles.field}>
      <AppText variant="label">{t('growth.method')}</AppText>
      <AppText variant="bodySmall" style={styles.secondary}>{t('growth.methodNote')}</AppText>
      {lengthMethods.map(method => <Button key={method} disabled={disabled}
        accessibilityState={{ selected: state.draft.method === method, disabled }}
        onPress={() => controller.changeDraft({ method }, context)}
        variant={state.draft.method === method ? 'primary' : 'secondary'}>{t(`growth.methods.${method}`)}</Button>)}
      {error('method')}
    </View>}
    {error('measurements')}
    <AppText variant="bodySmall" style={styles.secondary}>{t('growth.guardrailNote')}</AppText>
    <Button disabled={disabled} onPress={() => void controller.save()}>
      {t(state.busy ? 'growth.saving' : state.editing === null ? 'growth.save' : 'growth.saveEdit')}
    </Button>
    {state.editing !== null && <Button disabled={disabled} variant="secondary" onPress={controller.cancelEdit}>{t('growth.cancel')}</Button>}
  </Card>;
}
const styles = StyleSheet.create({
  card: { gap: spacing.md }, field: { gap: spacing.sm }, secondary: { color: lightColors.textSecondary },
  error: { color: lightColors.error },
  input: { minHeight: 52, padding: spacing.md, borderWidth: 1, borderColor: lightColors.borderSubtle,
    borderRadius: radii.md, backgroundColor: lightColors.surface, color: lightColors.textPrimary, ...typography.body },
  inputError: { borderColor: lightColors.error },
});
