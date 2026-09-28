import { api } from '@/infrastructure/api';
import type { Session } from '@/infrastructure/security/session-store';

// `login` aceita e-mail ou usuário, como no ComercialWeb web (LoginRequest).
export type Credentials = { login: string; password: string };

// Contrato provisório: será alinhado ao backend quando o endpoint existir.
export async function login(credentials: Credentials): Promise<Session> {
  if (api) return api.request<Session>('/v1/auth/login', { method: 'POST', body: credentials });

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

export async function logout(): Promise<void> {
  // Revogação server-side; falha de rede não impede limpar o aparelho.
  await api?.request('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
}
