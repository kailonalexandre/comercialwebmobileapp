import { ApiError, createApiClient, type RefreshOutcome } from '@/infrastructure/api/client';

type Reply = Partial<Response> | Error;

// Aceita uma resposta fixa ou uma sequência (uma por chamada, a última se repete).
function setup(response: Reply | Reply[], token: string | null = 'tok', refresh: RefreshOutcome = 'rejected') {
  const replies = Array.isArray(response) ? response : [response];
  let call = 0;
  const fetchImpl = jest.fn(async () => {
    const r = replies[Math.min(call++, replies.length - 1)]!;
    if (r instanceof Error) throw r;
    return { ok: true, status: 200, json: async () => ({ ok: 1 }), ...r } as Response;
  });
  const onUnauthorized = jest.fn();
  const refreshSession = jest.fn(async () => refresh);
  const client = createApiClient({
    baseUrl: 'https://api.test',
    getAccessToken: async () => token,
    onUnauthorized,
    refreshSession,
    fetchImpl,
    newId: () => 'corr-1',
    sleep: async () => undefined,
  });
  return { client, fetchImpl, onUnauthorized, refreshSession };
}

function firstCall(fetchImpl: jest.Mock) {
  return fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
}

test('envia token, correlation id e idempotency key', async () => {
  const { client, fetchImpl } = setup({});
  await expect(client.request('/v1/x', { method: 'POST', body: { a: 1 }, idempotencyKey: 'k1' })).resolves.toEqual({
    ok: 1,
  });
  const [url, init] = firstCall(fetchImpl);
  expect(url).toBe('https://api.test/v1/x');
  expect(init.headers).toMatchObject({
    Authorization: 'Bearer tok',
    'X-Correlation-ID': 'corr-1',
    'Idempotency-Key': 'k1',
  });
});

test('sem token não envia Authorization', async () => {
  const { client, fetchImpl } = setup({}, null);
  await client.request('/v1/x');
  expect(firstCall(fetchImpl)[1].headers).not.toHaveProperty('Authorization');
});

test('401 com refresh recusado dispara logout forçado e erro tipado', async () => {
  const { client, onUnauthorized, refreshSession } = setup({ ok: false, status: 401 });
  await expect(client.request('/v1/x')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

test('401 com refresh ok repete a requisição uma vez e devolve o resultado', async () => {
  const { client, fetchImpl, onUnauthorized } = setup([{ ok: false, status: 401 }, {}], 'tok', 'ok');
  await expect(client.request('/v1/x', { method: 'POST', body: {} })).resolves.toEqual({ ok: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(onUnauthorized).not.toHaveBeenCalled();
});

test('401 persistente após refresh não entra em laço', async () => {
  const { client, fetchImpl, refreshSession, onUnauthorized } = setup({ ok: false, status: 401 }, 'tok', 'ok');
  await expect(client.request('/v1/x')).rejects.toMatchObject({ kind: 'unauthorized' });
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

test('refresh sem rede não desloga', async () => {
  const { client, onUnauthorized } = setup({ ok: false, status: 401 }, 'tok', 'network');
  await expect(client.request('/v1/x')).rejects.toMatchObject({ kind: 'network' });
  expect(onUnauthorized).not.toHaveBeenCalled();
});

test('rota anônima: sem Authorization, 401 não tenta refresh nem desloga', async () => {
  const { client, fetchImpl, refreshSession, onUnauthorized } = setup({ ok: false, status: 401 });
  await expect(client.request('/v1/auth/login', { method: 'POST', body: {}, anonymous: true })).rejects.toMatchObject({
    kind: 'unauthorized',
  });
  expect(firstCall(fetchImpl)[1].headers).not.toHaveProperty('Authorization');
  expect(refreshSession).not.toHaveBeenCalled();
  expect(onUnauthorized).not.toHaveBeenCalled();
});

test('403 não desloga', async () => {
  const { client, onUnauthorized } = setup({ ok: false, status: 403 });
  await expect(client.request('/v1/x')).rejects.toMatchObject({ kind: 'forbidden' });
  expect(onUnauthorized).not.toHaveBeenCalled();
});

test('falha de rede vira ApiError com mensagem genérica', async () => {
  const { client } = setup(new TypeError('Network request failed'));
  const error = await client.request('/v1/x').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ kind: 'network', message: 'Não foi possível concluir a operação.' });
});

test('POST sem idempotency key nunca é repetido', async () => {
  const { client, fetchImpl } = setup({ ok: false, status: 503 });
  await expect(client.request('/v1/sales', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'server' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('422 traz a mensagem de regra de negócio do servidor', async () => {
  const body = { code: 'payment_incomplete', message: 'Cliente bloqueado.', totalCents: 3000, remainingCents: 2000 };
  const { client } = setup({ ok: false, status: 422, json: async () => body });
  await expect(client.request('/v1/pre-sales', { method: 'POST', body: {} })).rejects.toMatchObject({
    kind: 'validation',
    serverMessage: 'Cliente bloqueado.',
    refusal: { code: 'payment_incomplete', totalCents: 3000, remainingCents: 2000 },
  });
});

test('duas requisições com 401 ao mesmo tempo disparam um único refresh e ambas são repetidas', async () => {
  const replies = [{ ok: false, status: 401 }, { ok: false, status: 401 }, {}, {}];
  let call = 0;
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: 1 }), ...replies[call++] }) as Response);
  const refreshSession = jest.fn(() => new Promise<RefreshOutcome>((resolve) => setTimeout(() => resolve('ok'), 10)));
  const client = createApiClient({
    baseUrl: 'https://api.test',
    getAccessToken: async () => 'tok',
    onUnauthorized: jest.fn(),
    refreshSession,
    fetchImpl,
    sleep: async () => undefined,
  });
  await expect(Promise.all([client.request('/v1/a'), client.request('/v1/b')])).resolves.toEqual([{ ok: 1 }, { ok: 1 }]);
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

test('refresh recusado com requisições simultâneas limpa a sessão', async () => {
  const { client, onUnauthorized, refreshSession } = setup({ ok: false, status: 401 });
  await Promise.all([client.request('/v1/a').catch(() => 0), client.request('/v1/b').catch(() => 0)]);
  expect(refreshSession).toHaveBeenCalled();
  expect(onUnauthorized).toHaveBeenCalled();
});

test('5xx em GET é repetido com backoff exponencial e depois entrega o erro', async () => {
  const sleep = jest.fn(async () => undefined);
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 503 }) as Response);
  const client = createApiClient({ baseUrl: 'https://api.test', getAccessToken: async () => 'tok', onUnauthorized: jest.fn(), fetchImpl, sleep });
  await expect(client.request('/v1/x')).rejects.toMatchObject({ kind: 'server' });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(sleep.mock.calls).toEqual([[500], [1000]]);
});

test('POST com Idempotency-Key pode ser repetido em 5xx; 4xx nunca', async () => {
  const { client, fetchImpl } = setup([{ ok: false, status: 503 }, {}]);
  await expect(client.request('/v1/x', { method: 'POST', body: {}, idempotencyKey: 'k' })).resolves.toEqual({ ok: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(2);

  const again = setup({ ok: false, status: 404 });
  await expect(again.client.request('/v1/x')).rejects.toMatchObject({ kind: 'not_found' });
  expect(again.fetchImpl).toHaveBeenCalledTimes(1);
});

test('429 expõe Retry-After e não é repetido', async () => {
  const { client, fetchImpl } = setup({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '42' }) });
  await expect(client.request('/v1/x', { method: 'POST', body: {}, anonymous: true })).rejects.toMatchObject({
    status: 429,
    retryAfterSeconds: 42,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('log de rede mostra método, caminho sem query e status, nunca o token', async () => {
  const lines: string[] = [];
  const client = createApiClient({
    baseUrl: 'https://api.test',
    getAccessToken: async () => 'segredo-token',
    onUnauthorized: jest.fn(),
    fetchImpl: jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
    log: (l) => lines.push(l),
  });
  await client.request('/v1/customers?search=maria');
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^GET \/v1\/customers -> 200 \d+ms/);
  expect(lines[0]).not.toContain('segredo-token');
});
