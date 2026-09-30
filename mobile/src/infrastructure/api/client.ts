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
export type Refusal = { code?: string; message?: string; totalCents?: number; remainingCents?: number };

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status?: number,
    readonly correlationId?: string,
    // Recusa de regra de negócio (422): código estável, mensagem pronta para o usuário e, quando houver, totais.
    readonly refusal?: Refusal,
    // 429: segundos pedidos pelo servidor (Retry-After), para a tela orientar o usuário.
    readonly retryAfterSeconds?: number,
  ) {
    super('Não foi possível concluir a operação.');
    this.name = 'ApiError';
  }

  get serverMessage(): string | undefined {
    return this.refusal?.message;
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
  sleep?: (ms: number) => Promise<void>;
  // Linha de diagnóstico (método, caminho, status, tempo): nunca recebe token nem query string.
  log?: (line: string) => void;
};

// fetch não separa conexão de leitura: 30 s cobrem a requisição inteira.
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

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
  // Só falha transitória (5xx, rede, timeout) e só onde repetir é seguro: leitura, ou escrita com
  // Idempotency-Key (o servidor deduplica). POST sem chave nunca é repetido.
  const transient = error.kind === 'server' || error.kind === 'network' || error.kind === 'timeout';
  return transient && (method === 'GET' || hasIdempotencyKey);
}

async function readRefusal(response: Response): Promise<Refusal | undefined> {
  try {
    const b = (await response.json()) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' && v.length <= 300 ? v : undefined);
    const cents = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : undefined);
    return { code: text(b.code), message: text(b.message), totalCents: cents(b.totalCents), remainingCents: cents(b.remainingCents) };
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
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log,
}: ClientDeps) {
  // Várias requisições com 401 ao mesmo tempo compartilham uma única renovação:
  // o servidor aceita cada refresh token uma vez só e trataria a segunda como reuso (roubo).
  let refreshing: Promise<RefreshOutcome> | null = null;
  const refreshOnce = () => (refreshing ??= refreshSession().finally(() => (refreshing = null)));

  async function attempt<T>(path: string, options: RequestOptions, correlationId: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    // Sinal do chamador já cancelado (ou cancelado depois) aborta esta tentativa; o listener some junto com ela.
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Correlation-ID': correlationId,
    };
    const token = options.anonymous ? null : await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const startedAt = Date.now();
    const route = `${options.method ?? 'GET'} ${path.split('?')[0]}`;
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
      const kind = controller.signal.aborted && !cancelledByCaller ? 'timeout' : 'network';
      log?.(`${route} -> ${kind} ${Date.now() - startedAt}ms [${correlationId}]`);
      throw new ApiError(kind, undefined, correlationId);
    } finally {
      clearTimeout(timer);
    }

    log?.(`${route} -> ${response.status} ${Date.now() - startedAt}ms [${correlationId}]`);
    if (!response.ok) {
      const refusal = response.status === 422 ? await readRefusal(response) : undefined;
      const wait = response.status === 429 ? Number(response.headers?.get('Retry-After')) : NaN;
      throw new ApiError(
        kindFromStatus(response.status),
        response.status,
        correlationId,
        refusal,
        Number.isFinite(wait) && wait > 0 ? wait : undefined,
      );
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
            const outcome = refreshed ? 'rejected' : await refreshOnce();
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
          await sleep(BACKOFF_BASE_MS * 2 ** (n - 1));
        }
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
