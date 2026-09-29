import { formatLocal, toKpis, type Dashboard } from '@/features/dashboard/dashboard-model';

const empty: Dashboard = { salesToday: null, receivables: null, lowStockCount: null, openConditionals: null, recentSales: null };

test('sem permissão o cartão não existe', () => {
  expect(toKpis(empty)).toEqual([]);
  expect(toKpis({ ...empty, lowStockCount: 0 }).map((k) => k.id)).toEqual(['low-stock']);
});

test('formata valores e concordância', () => {
  const [sales, receivable] = toKpis({ ...empty, salesToday: { count: 1, totalCents: 12_000 }, receivables: { count: 5, totalCents: 48_467 } });
  expect(sales?.detail).toBe('1 venda finalizada');
  expect(receivable?.detail).toBe('5 títulos em aberto');
  expect(receivable?.value).toMatch(/484,67/);
});

test('data local sem conversão de fuso', () => {
  expect(formatLocal('2026-09-10T22:00:00')).toBe('10/09/2026 22:00');
  expect(formatLocal('lixo')).toBe('lixo');
});
