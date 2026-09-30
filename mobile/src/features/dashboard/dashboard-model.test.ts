import { formatLocal } from '@/features/dashboard/dashboard-model';

test('data local sem conversão de fuso', () => {
  expect(formatLocal('2026-09-10T22:00:00')).toBe('10/09/2026 22:00');
  expect(formatLocal('lixo')).toBe('lixo');
});
