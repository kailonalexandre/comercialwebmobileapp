import { createApiClient } from '@/infrastructure/api/client';
import { apiBaseUrl } from '@/infrastructure/config';
import { getAccessToken } from '@/infrastructure/security/session-store';

let unauthorizedHandler = () => {};

// A sessão registra aqui o logout forçado quando a API responde 401.
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export const api = apiBaseUrl
  ? createApiClient({ baseUrl: apiBaseUrl, getAccessToken, onUnauthorized: () => unauthorizedHandler() })
  : null;
