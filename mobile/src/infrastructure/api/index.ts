import { createApiClient, type RefreshOutcome } from '@/infrastructure/api/client';
import { apiBaseUrl, appEnv } from '@/infrastructure/config';
import { getAccessToken, getRefreshToken, isSession, replaceSession } from '@/infrastructure/security/session-store';

let unauthorizedHandler = () => {};

// A sessão registra aqui o logout forçado quando a renovação é recusada.
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

async function refreshSession(): Promise<RefreshOutcome> {
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
    // Só 401/422 derrubam a sessão; rede, 5xx e 429 são transitórios e mantêm o par de tokens.
    const { kind, status } = e as { kind?: string; status?: number };
    return kind === 'network' || kind === 'timeout' || kind === 'server' || status === 429 ? 'network' : 'rejected';
  }
}

export const api = apiBaseUrl
  ? createApiClient({
      baseUrl: apiBaseUrl,
      getAccessToken,
      onUnauthorized: () => unauthorizedHandler(),
      refreshSession,
      // Só no flavor local; a linha nunca contém token.
      log: appEnv.verboseLogs ? (line) => console.debug(`[api] ${line}`) : undefined,
    })
  : null;
