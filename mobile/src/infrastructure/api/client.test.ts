import { ApiError, createApiClient } from '@/infrastructure/api/client';

function setup(response: Partial<Response> | Error, token: string | null = 'tok') {
  const fetchImpl = jest.fn(async () => {
    if (response instanceof Error) throw response;
    return { ok: true, status: 200, json: async () => ({ ok: 1 }), ...response } as Response;
  });
  const onUnauthorized = jest.fn();
  const client = createApiClient({
    baseUrl: 'https://api.test',
    getAccessToken: async () => token,
    onUnauthorized,
    fetchImpl,
    newId: () => 'corr-1',
  });
  return { client, fetchImpl, onUnauthorized };
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

test('401 dispara logout forçado e erro tipado', async () => {
  const { client, onUnauthorized } = setup({ ok: false, status: 401 });
  await expect(client.request('/v1/x')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
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
