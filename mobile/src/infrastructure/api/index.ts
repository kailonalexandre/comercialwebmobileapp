import { createApiClient, type RefreshOutcome } from '@/infrastructure/api/client';
import { apiBaseUrl, appEnv } from '@/infrastructure/config';
import { getAccessToken, getRefreshToken, isSession, replaceSession } from '@/infrastructure/security/session-store';

let unauthorizedHandler = () => {};

let minVersionHandler: (minimum?: string | null) => void = () => {};

// A sessão registra aqui o aviso de versão mínima que chega a cada renovação de token.
export function setMinVersionHandler(handler: (minimum?: string | null) => void) {
  minVersionHandler = handler;
}

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
    // Sem o campo (ComercialWeb fora do ar) mantém o estado anterior: instabilidade não desbloqueia app desatualizado.
    if (session.minAppVersion) minVersionHandler(session.minAppVersion);
    return 'ok';
  } catch (e) {
    // Só 401/422 derrubam a sessão. Rede, 5xx, 429 e respostas estranhas (portal cativo, WAF, 403/404 de proxy)
    // são transitórios: mantêm o par de tokens e o usuário tenta de novo.
    const { status } = e as { status?: number };
    return status === 401 || status === 422 ? 'rejected' : 'network';
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
