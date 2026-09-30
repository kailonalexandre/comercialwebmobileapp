import { createEnvironment, resolveBaseUrl, serverRefusal } from '@/infrastructure/config';

const local = createEnvironment('local', false, undefined);
const vps = createEnvironment('vps', false, 'app.exemplo.com.br, *.cliente.com.br');
const refusal = (env: typeof local, url: string) => serverRefusal(env, new URL(url));

test('vps é o padrão seguro fora de dev; dev cai em local', () => {
  expect(createEnvironment(undefined, false, undefined).name).toBe('vps');
  expect(createEnvironment('qualquer', false, undefined).name).toBe('vps');
  expect(createEnvironment(undefined, true, undefined).name).toBe('local');
  expect(createEnvironment('vps', true, undefined).name).toBe('vps');
});

test('só local libera HTTP, logs verbosos e colagem manual', () => {
  expect(local).toMatchObject({ allowHttp: true, verboseLogs: true, allowManualPairing: true });
  expect(vps).toMatchObject({ allowHttp: false, verboseLogs: false, allowManualPairing: false });
  expect(vps.allowedHosts).toEqual(['app.exemplo.com.br', '*.cliente.com.br']);
});

test('local aceita HTTP só em rede privada', () => {
  for (const ok of ['http://192.168.0.10:8080', 'http://10.0.2.2:8080', 'http://172.20.1.5', 'http://localhost:8080']) {
    expect(refusal(local, ok)).toBeNull();
  }
  expect(refusal(local, 'http://172.32.0.1')).not.toBeNull();
  expect(refusal(local, 'http://exemplo.com')).not.toBeNull();
});

test('vps recusa HTTP e host fora da lista; aceita exato e curinga', () => {
  expect(refusal(vps, 'http://app.exemplo.com.br')).toMatch(/HTTPS/);
  expect(refusal(vps, 'https://outro.com')).toMatch(/não autorizado/);
  expect(refusal(vps, 'https://app.exemplo.com.br')).toBeNull();
  expect(refusal(vps, 'https://loja.cliente.com.br')).toBeNull();
  expect(refusal(vps, 'https://cliente.com.br')).not.toBeNull();
  expect(refusal(vps, 'https://evilcliente.com.br')).not.toBeNull();
  expect(refusal(createEnvironment('vps', false, undefined), 'https://app.exemplo.com.br')).not.toBeNull();
});

test('URL base exige HTTPS quando HTTP não é permitido', () => {
  expect(() => resolveBaseUrl('http://api.exemplo.com', false)).toThrow();
  expect(resolveBaseUrl('https://api.exemplo.com/api/', false)).toBe('https://api.exemplo.com/api');
  expect(resolveBaseUrl('http://10.0.2.2:8080', true)).toBe('http://10.0.2.2:8080');
  expect(resolveBaseUrl(undefined, false)).toBeNull();
});
