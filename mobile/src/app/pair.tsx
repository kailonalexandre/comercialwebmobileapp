import { useLocalSearchParams } from 'expo-router';

import { LoginScreen } from '@/features/auth/login-screen';

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? '';

// Deep link comercialweb://pair?code=…&server=… (câmera do sistema). Só monta o link; a tela valida e pede confirmação.
export default function PairRoute() {
  const { code, server } = useLocalSearchParams<{ code?: string; server?: string }>();
  const link = `comercialweb://pair?code=${encodeURIComponent(one(code))}&server=${encodeURIComponent(one(server))}`;
  // key: um segundo link com a tela já aberta recomeça a confirmação em vez de ser ignorado.
  return <LoginScreen key={link} deepLink={link} />;
}
