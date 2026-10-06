import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import type { ChildrenBootstrapStatus } from '@/features/children/application/get-children-bootstrap-status';
import { useChildrenRuntime } from '@/runtime/app-runtime-provider';
import { lightColors, spacing } from '@/theme/tokens';

import { ActiveChildSelectionRecoveryScreen } from './active-child-selection-recovery-screen';

type ResolvedNavigationStatus = Extract<
  ChildrenBootstrapStatus['status'],
  'ready' | 'onboarding-required'
>;

type ChildBootstrapPresentationState =
  | 'checking'
  | ChildrenBootstrapStatus['status']
  | 'local-data-error';

type ChildBootstrapGateProps = Readonly<{
  children(status: ResolvedNavigationStatus): ReactNode;
}>;

type ChildBootstrapContextValue = Readonly<{
  refreshBootstrap(): Promise<void>;
}>;

const ChildBootstrapContext = createContext<ChildBootstrapContextValue | null>(
  null,
);

export function ChildBootstrapGate({ children }: ChildBootstrapGateProps) {
  const childrenRuntime = useChildrenRuntime();
  const { t } = useTranslation();
  const [state, setState] = useState<ChildBootstrapPresentationState>('checking');
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const refreshBootstrap = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (mountedRef.current) {
      setState('checking');
    }

    try {
      const result = await childrenRuntime.getBootstrapStatus();

      if (mountedRef.current && requestIdRef.current === requestId) {
        setState(result.status);
      }
    } catch {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState('local-data-error');
      }
    }
  }, [childrenRuntime]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshBootstrap();

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [refreshBootstrap]);

  const contextValue = useMemo(
    () => ({ refreshBootstrap }),
    [refreshBootstrap],
  );

  let content: ReactNode;

  if (state === 'checking') {
    content = (
      <Screen style={styles.screen}>
        <View style={styles.loading}>
          <ActivityIndicator color={lightColors.actionPrimary} size="large" />
          <AppText>{t('bootstrap.checking')}</AppText>
        </View>
      </Screen>
    );
  } else if (state === 'local-data-error') {
    content = (
      <RecoveryScreen
        description={t('bootstrap.localDataError.description')}
        onRetry={refreshBootstrap}
        retryLabel={t('bootstrap.retry')}
        title={t('bootstrap.localDataError.title')}
      />
    );
  } else if (state === 'active-selection-required') {
    content = (
      <ActiveChildSelectionRecoveryScreen
        refreshBootstrap={refreshBootstrap}
      />
    );
  } else {
    content = children(state);
  }

  return (
    <ChildBootstrapContext.Provider value={contextValue}>
      {content}
    </ChildBootstrapContext.Provider>
  );
}

export function useChildBootstrap(): ChildBootstrapContextValue {
  const context = useContext(ChildBootstrapContext);

  if (context === null) {
    throw new Error('useChildBootstrap must be used within ChildBootstrapGate.');
  }

  return context;
}

type RecoveryScreenProps = Readonly<{
  description: string;
  onRetry(): Promise<void>;
  retryLabel: string;
  title: string;
}>;

function RecoveryScreen({
  description,
  onRetry,
  retryLabel,
  title,
}: RecoveryScreenProps) {
  return (
    <Screen style={styles.screen}>
      <Card style={styles.card}>
        <AppText variant="headingMedium">{title}</AppText>
        <AppText style={styles.description}>{description}</AppText>
        <Button onPress={() => void onRetry()}>{retryLabel}</Button>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  loading: {
    alignItems: 'center',
    gap: spacing.md,
  },
  card: {
    gap: spacing.lg,
  },
  description: {
    color: lightColors.textSecondary,
  },
});
