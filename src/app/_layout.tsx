import { Stack, usePathname } from 'expo-router';

import '@/i18n';
import { ChildBootstrapGate } from '@/features/children/presentation/child-bootstrap-gate';
import { AppRuntimeProvider } from '@/runtime/app-runtime-provider';

export default function RootLayout() {
  const pathname = usePathname();
  const bypassProductBootstrap =
    __DEV__ && pathname === '/__dev/sqlcipher';

  if (bypassProductBootstrap) {
    return <RootStack bootstrapStatus={null} />;
  }

  return (
    <AppRuntimeProvider>
      <ChildBootstrapGate>
        {(bootstrapStatus) => (
          <RootStack bootstrapStatus={bootstrapStatus} />
        )}
      </ChildBootstrapGate>
    </AppRuntimeProvider>
  );
}

type RootStackProps = Readonly<{
  bootstrapStatus: 'ready' | 'onboarding-required' | null;
}>;

function RootStack({ bootstrapStatus }: RootStackProps) {
  return (
    <Stack>
      <Stack.Protected guard={bootstrapStatus === 'ready'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={bootstrapStatus === 'onboarding-required'}>
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      </Stack.Protected>

      {__DEV__ && (
        <Stack.Screen
          name="__dev/sqlcipher"
          options={{ title: 'SQLCipher verification' }}
        />
      )}
    </Stack>
  );
}
