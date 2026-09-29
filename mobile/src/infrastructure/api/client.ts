import { randomUUID } from 'expo-crypto';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'unknown';

// Erro tipado. `message` é sempre genérica; detalhes técnicos ficam no servidor, rastreáveis pelo correlationId.
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status?: number,
    readonly correlationId?: string,
    // Mensagem de regra de negócio do servidor (422), pronta para o usuário. Nunca texto técnico.
    readonly serverMessage?: string,
  ) {
    super('Não foi possível concluir a operação.');
    this.name = 'ApiError';
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  // Obrigatório em operações com efeito financeiro/estoque: o servidor deduplica pelo valor.
  idempotencyKey?: string;
  // Rotas sem sessão (login, refresh): não envia token e 401 significa credencial inválida.
  anonymous?: boolean;
};

// Resultado da renovação: 'network' não derruba a sessão (usuário pode estar só offline).
export type RefreshOutcome = 'ok' | 'rejected' | 'network';

type ClientDeps = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  onUnauthorized: () => void;
  refreshSession?: () => Promise<RefreshOutcome>;
  fetchImpl?: typeof fetch;
  newId?: () => string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

export function kindFromStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/**
 * Decide se uma requisição que falhou pode ser repetida automaticamente.
 *
 * @param method  método HTTP da requisição
 * @param error   erro obtido na tentativa atual
 * @param hasIdempotencyKey  true quando a requisição carrega Idempotency-Key
 * @returns true para repetir (até MAX_ATTEMPTS no total)
 */
export function shouldRetry(method: HttpMethod, error: ApiError, hasIdempotencyKey: boolean): boolean {
  // TODO(usuário): definir a política de retry. Padrão seguro atual: nunca repetir.
  void method;
  void error;
  void hasIdempotencyKey;
  return false;
}

async function readBusinessMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length <= 300 ? body.message : undefined;
  } catch {
    return undefined;
  }
}

export function createApiClient({
  baseUrl,
  getAccessToken,
  onUnauthorized,
  refreshSession = async () => 'rejected',
  fetchImpl = fetch,
  newId = randomUUID,
}: ClientDeps) {
  async function attempt<T>(path: string, options: RequestOptions, correlationId: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    options.signal?.addEventListener('abort', () => controller.abort());

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Correlation-ID': correlationId,
    };
    const token = options.anonymous ? null : await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch {
      const cancelledByCaller = options.signal?.aborted ?? false;
      throw new ApiError(controller.signal.aborted && !cancelledByCaller ? 'timeout' : 'network', undefined, correlationId);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const serverMessage = response.status === 422 ? await readBusinessMessage(response) : undefined;
      throw new ApiError(kindFromStatus(response.status), response.status, correlationId, serverMessage);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      const method = options.method ?? 'GET';
      const correlationId = newId();
      let refreshed = false;
      for (let n = 1; ; n++) {
        try {
          return await attempt<T>(path, options, correlationId);
        } catch (e) {
          const error = e instanceof ApiError ? e : new ApiError('unknown', undefined, correlationId);
          // Access token expirado: renova uma vez e repete. Seguro mesmo em POST, pois o 401
          // vem da autenticação, antes de o servidor executar a operação.
          if (error.kind === 'unauthorized' && !options.anonymous) {
            const outcome = refreshed ? 'rejected' : await refreshSession();
            if (outcome === 'ok') {
              refreshed = true;
              n--;
              continue;
            }
            if (outcome === 'network') throw new ApiError('network', undefined, correlationId);
            onUnauthorized();
            throw error;
          }
          if (n >= MAX_ATTEMPTS || options.signal?.aborted || !shouldRetry(method, error, !!options.idempotencyKey)) {
            throw error;
          }
        }
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
