import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import {
  runSqlCipherDevelopmentVerification,
  type SqlCipherVerificationResult,
} from '@/data/local/dev/verify-sqlcipher';
import { lightColors, spacing } from '@/theme/tokens';

type VerificationState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'passed'; result: SqlCipherVerificationResult }
  | { status: 'failed' };

export default function SqlCipherVerificationScreen() {
  const [state, setState] = useState<VerificationState>({ status: 'idle' });

  if (!__DEV__) {
    return <Redirect href="/index" />;
  }

  const runVerification = async () => {
    setState({ status: 'running' });

    try {
      const result = await runSqlCipherDevelopmentVerification();
      setState({ status: 'passed', result });
    } catch {
      setState({ status: 'failed' });
    }
  };

  return (
    <Screen style={styles.screen}>
      <AppText variant="headingMedium">SQLCipher development verification</AppText>
      <AppText style={styles.description}>
        Uses synthetic data only. Encryption keys and native error details are never displayed.
      </AppText>

      <Button disabled={state.status === 'running'} onPress={runVerification}>
        {state.status === 'running' ? 'Running verification…' : 'Run verification'}
      </Button>

      {state.status === 'passed' && (
        <View style={styles.results}>
          <AppText variant="headingSmall" style={styles.success}>
            Verification passed
          </AppText>
          <AppText>SQLCipher version: {state.result.cipherVersion}</AppText>
          <AppText>Encrypted database opened: yes</AppText>
          <AppText>Marker persisted after reopen: yes</AppText>
          <AppText>Wrong key rejected: yes</AppText>
          <AppText>Database preserved after failure: yes</AppText>
        </View>
      )}

      {state.status === 'failed' && (
        <AppText style={styles.error}>
          Verification failed. No database recovery or deletion was attempted.
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
    gap: spacing.lg,
  },
  description: {
    color: lightColors.textSecondary,
  },
  results: {
    gap: spacing.sm,
  },
  success: {
    color: lightColors.success,
  },
  error: {
    color: lightColors.error,
  },
});
