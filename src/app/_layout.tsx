import { Stack } from 'expo-router';

import '@/i18n';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {__DEV__ && (
        <Stack.Screen
          name="__dev/sqlcipher"
          options={{ title: 'SQLCipher verification' }}
        />
      )}
    </Stack>
  );
}
