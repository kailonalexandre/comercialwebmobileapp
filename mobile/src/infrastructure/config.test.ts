import { resolveBaseUrl, resolveEnvironment } from '@/infrastructure/config';

test('exige HTTPS fora de desenvolvimento', () => {
  expect(() => resolveBaseUrl('http://api.exemplo.com', false)).toThrow();
  expect(resolveBaseUrl('https://api.exemplo.com/api/', false)).toBe('https://api.exemplo.com/api');
});

test('permite HTTP local em desenvolvimento e ausência de URL', () => {
  expect(resolveBaseUrl('http://10.0.2.2:8080', true)).toBe('http://10.0.2.2:8080');
  expect(resolveBaseUrl(undefined, false)).toBeNull();
});

test('ambiente desconhecido cai no padrão seguro', () => {
  expect(resolveEnvironment('homologacao', false)).toBe('homologacao');
  expect(resolveEnvironment('qualquer', false)).toBe('producao');
  expect(resolveEnvironment(undefined, true)).toBe('local');
});
