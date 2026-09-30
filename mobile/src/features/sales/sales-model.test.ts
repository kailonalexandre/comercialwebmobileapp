import { formatQuantity, statusLabel, statusTone } from '@/features/sales/sales-model';

test('rótulos e tons de status, com fallback para valor novo', () => {
  expect(statusLabel('pre_venda')).toBe('Pré-venda');
  expect(statusLabel('algo_novo')).toBe('algo_novo');
  expect(statusTone('finalizada')).toBe('success');
  expect(statusTone('algo_novo')).toBe('primary');
});

test('quantidade fracionada sem zeros sobrando', () => {
  expect(formatQuantity(2)).toBe('2');
  expect(formatQuantity(2.5)).toBe('2,5');
});
