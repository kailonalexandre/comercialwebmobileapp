import { userMessage } from '@/shared/utils/error-message';

test('403 e falha de rede têm texto próprio; o resto usa o padrão', () => {
  expect(userMessage({ kind: 'forbidden' })).toMatch(/permissão/);
  expect(userMessage({ kind: 'timeout' })).toMatch(/conexão/);
  expect(userMessage({ kind: 'server' })).toBeUndefined();
  expect(userMessage(new Error('x'))).toBeUndefined();
  expect(userMessage(null)).toBeUndefined();
});
