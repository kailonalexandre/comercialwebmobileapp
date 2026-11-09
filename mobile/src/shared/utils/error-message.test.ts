import { userMessage } from '@/shared/utils/error-message';

test('cada tipo de falha tem texto próprio; o desconhecido usa o padrão', () => {
  expect(userMessage({ kind: 'forbidden' })).toMatch(/permissão/);
  expect(userMessage({ kind: 'timeout' })).toMatch(/conexão/);
  expect(userMessage({ kind: 'conflict' })).toMatch(/empresa ativa/);
  expect(userMessage({ kind: 'server' })).toMatch(/servidor/);
  expect(userMessage({ kind: 'unauthorized' })).toMatch(/sessão/);
  expect(userMessage({ kind: 'unknown' })).toBeUndefined();
  expect(userMessage(new Error('x'))).toBeUndefined();
  expect(userMessage(null)).toBeUndefined();
});
