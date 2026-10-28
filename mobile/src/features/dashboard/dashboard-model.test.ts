import { formatLocal, goalSummary } from '@/features/dashboard/dashboard-model';

test('data local sem conversão de fuso', () => {
  expect(formatLocal('2026-09-10T22:00:00')).toBe('10/09/2026 22:00');
  expect(formatLocal('lixo')).toBe('lixo');
});

test('meta mostra percentual e realizado; sem meta não inventa número', () => {
  expect(goalSummary({ scope: 'seller', goalCents: 40_000, soldCents: 15_000, percent: 38 })).toEqual({ value: '38%', caption: expect.stringMatching(/150,00 de .*400,00/), progress: 0.375 });
  expect(goalSummary({ scope: 'company', goalCents: 100, soldCents: 250, percent: 250 }).progress).toBe(1);
  expect(goalSummary({ scope: 'company', goalCents: 100, soldCents: -50, percent: -50 }).progress).toBe(0);
  expect(goalSummary(null)).toEqual({ value: '—', caption: 'Sem meta definida', progress: null });
  expect(goalSummary({ scope: 'company', goalCents: 0, soldCents: 10, percent: 0 }).value).toBe('—');
});
