import { createApiClient, type RefreshOutcome } from '@/infrastructure/api/client';
import { apiBaseUrl } from '@/infrastructure/config';
import { getAccessToken, getRefreshToken, isSession, replaceSession } from '@/infrastructure/security/session-store';

let unauthorizedHandler = () => {};

// A sessão registra aqui o logout forçado quando a renovação é recusada.
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

// Várias requisições com 401 ao mesmo tempo compartilham uma única renovação:
// o servidor aceita cada refresh token uma vez só e trataria a segunda como roubo.
let refreshing: Promise<RefreshOutcome> | null = null;

function refreshSession(): Promise<RefreshOutcome> {
  refreshing ??= renew().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function renew(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken();
  if (!api || !refreshToken) return 'rejected';
  try {
    const session = await api.request<unknown>('/v1/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      anonymous: true,
    });
    if (!isSession(session)) return 'rejected';
    await replaceSession(session);
    return 'ok';
  } catch (e) {
    const kind = (e as { kind?: string }).kind;
    return kind === 'network' || kind === 'timeout' ? 'network' : 'rejected';
  }
}

export const api = apiBaseUrl
  ? createApiClient({
      baseUrl: apiBaseUrl,
      getAccessToken,
      onUnauthorized: () => unauthorizedHandler(),
      refreshSession,
    })
  : null;
