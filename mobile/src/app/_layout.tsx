import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider, useSession } from '@/features/auth/session-context';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/onboarding-context';
import { StateView } from '@/shared/components/state-view';

function RootNavigator() {
  const { status } = useSession();
  const { seen } = useOnboarding();
  if (status === 'loading' || seen === null) return <StateView kind="loading" />;

  const signedOut = status === 'signedOut';

  // Guarda de navegação é UX; autorização real acontece na API.
  return (
    <>
      <StatusBar style={signedOut && !seen ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={signedOut && !seen}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedOut && seen}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <OnboardingProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </OnboardingProvider>
  );
}
