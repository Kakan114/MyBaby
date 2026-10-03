import { Stack } from 'expo-router';

import '@/i18n';
import { AppRuntimeProvider } from '@/runtime/app-runtime-provider';

export default function RootLayout() {
  return (
    <AppRuntimeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {__DEV__ && (
          <Stack.Screen
            name="__dev/sqlcipher"
            options={{ title: 'SQLCipher verification' }}
          />
        )}
      </Stack>
    </AppRuntimeProvider>
  );
}
