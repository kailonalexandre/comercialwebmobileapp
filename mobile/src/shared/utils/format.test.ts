import { formatCents, formatMilli, normalizeSearch } from '@/shared/utils/format';

test('formatCents usa BRL a partir de centavos', () => {
  expect(formatCents(123456)).toMatch(/R\$\s?1\.234,56/);
  expect(formatCents(0)).toMatch(/R\$\s?0,00/);
});

test('formatMilli mostra até 3 casas sem zeros à direita', () => {
  expect(formatMilli(12500)).toBe('12,5');
  expect(formatMilli(3000)).toBe('3');
  expect(formatMilli(1234567)).toBe('1.234,567');
  expect(formatMilli(-2000)).toBe('-2');
});

test('normalizeSearch ignora acento e caixa', () => {
  expect(normalizeSearch('  Configurações ')).toBe('configuracoes');
  expect(normalizeSearch('ESTOQUE')).toBe('estoque');
});
