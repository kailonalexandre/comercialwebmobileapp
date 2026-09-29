import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider, useSession } from '@/features/auth/session-context';
import { DraftProvider } from '@/features/presale/draft-context';
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
          <Stack.Screen name="venda/[id]" />
          <Stack.Screen name="produtos" />
          <Stack.Screen name="clientes" />
          <Stack.Screen name="notificacoes" />
          <Stack.Screen name="nova-venda" />
          <Stack.Screen name="selecionar-produto" />
          <Stack.Screen name="selecionar-cliente" />
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

// O rascunho de pré-venda (e sua chave de idempotência) morre ao entrar/sair: nunca passa de um usuário a outro.
function SessionScopedDraft({ children }: { children: ReactNode }) {
  const { status } = useSession();
  return <DraftProvider key={status}>{children}</DraftProvider>;
}

export default function RootLayout() {
  return (
    <OnboardingProvider>
      <SessionProvider>
        <SessionScopedDraft>
          <RootNavigator />
        </SessionScopedDraft>
      </SessionProvider>
    </OnboardingProvider>
  );
}
