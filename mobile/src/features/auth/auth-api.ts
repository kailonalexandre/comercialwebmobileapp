import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { api } from '@/infrastructure/api';
import type { Session } from '@/infrastructure/security/session-store';

// `login` aceita e-mail ou usuário, como no ComercialWeb web (LoginRequest).
export type Credentials = { login: string; password: string };

// Empresa ativa vem do servidor (sessão), nunca de um valor enviado pelo app.
export type Profile = { userName: string; businessId: number; businessName: string };

// Identifica a sessão na lista de dispositivos sem expor o nome pessoal do aparelho.
const deviceName = `${Platform.OS === 'ios' ? 'iOS' : 'Android'} · app ${Constants.expoConfig?.version ?? ''}`.trim();

const devProfile: Profile = { userName: 'Administrador', businessId: 0, businessName: 'Empresa Demonstração' };

export async function login(credentials: Credentials): Promise<Session> {
  if (api) {
    return api.request<Session>('/v1/auth/login', {
      method: 'POST',
      body: { ...credentials, deviceName },
      anonymous: true,
    });
  }

  // Sem API configurada: sessão fictícia apenas em desenvolvimento, para validar telas.
  if (__DEV__) {
    return {
      accessToken: 'dev-mock-access',
      refreshToken: 'dev-mock-refresh',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }
  throw new Error('API não configurada.');
}

export async function fetchProfile(): Promise<Profile> {
  return api ? api.request<Profile>('/v1/me') : devProfile;
}

export async function logout(): Promise<void> {
  // Revogação server-side; falha de rede não impede limpar o aparelho.
  await api?.request('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
}
