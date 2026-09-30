import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold } from '@expo-google-fonts/inter-tight';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider, useSession } from '@/features/auth/session-context';
import { UpdateRequiredScreen } from '@/features/auth/update-required-screen';
import { PdvDraftProvider } from '@/features/pdv/pdv-draft';
import { PreSaleDraftProvider } from '@/features/presale/presale-draft';
import { PushBridge } from '@/features/push/push-bridge';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/onboarding-context';
import { StateView } from '@/shared/components/state-view';

function RootNavigator() {
  const { status, updateRequired } = useSession();
  const { seen } = useOnboarding();
  if (status === 'loading' || seen === null) return <StateView kind="loading" />;
  if (status === 'signedIn' && updateRequired) return <UpdateRequiredScreen />;

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
          <Stack.Screen name="produto/[id]" />
          <Stack.Screen name="cliente/[id]" />
          <Stack.Screen name="clientes" />
          <Stack.Screen name="notificacoes" />
          <Stack.Screen name="configuracoes" />
          <Stack.Screen name="pedido/[id]" />
          <Stack.Screen name="nova-venda" />
          <Stack.Screen name="selecionar-produto" />
          <Stack.Screen name="selecionar-cliente" />
        </Stack.Protected>
        <Stack.Protected guard={signedOut && !seen}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedOut}>
          <Stack.Screen name="pair" />
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
  return (
    <PreSaleDraftProvider key={status}>
      <PdvDraftProvider key={status}>{children}</PdvDraftProvider>
    </PreSaleDraftProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  // Falha ao carregar fonte não pode travar o app: cai na fonte do sistema.
  if (!fontsLoaded && !fontError) return <StateView kind="loading" />;

  return (
    <OnboardingProvider>
      <SessionProvider>
        <SessionScopedDraft>
          <PushBridge />
          <RootNavigator />
        </SessionScopedDraft>
      </SessionProvider>
    </OnboardingProvider>
  );
}
