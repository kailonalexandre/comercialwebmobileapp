import { useLocalSearchParams } from 'expo-router';

import { LoginScreen } from '@/features/auth/login-screen';

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? '';

// Deep link comercialweb://bind?code=…&server=… (QR de vínculo lido pela câmera do sistema). Pede confirmação antes de vincular.
export default function BindRoute() {
  const { code, server } = useLocalSearchParams<{ code?: string; server?: string }>();
  const link = `comercialweb://bind?code=${encodeURIComponent(one(code))}&server=${encodeURIComponent(one(server))}`;
  return <LoginScreen key={link} deepLink={link} />;
}
