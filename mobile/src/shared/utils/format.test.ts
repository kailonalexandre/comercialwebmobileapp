import { formatCents, normalizeSearch } from '@/shared/utils/format';

test('formatCents usa BRL a partir de centavos', () => {
  expect(formatCents(123456)).toMatch(/R\$\s?1\.234,56/);
  expect(formatCents(0)).toMatch(/R\$\s?0,00/);
});

test('normalizeSearch ignora acento e caixa', () => {
  expect(normalizeSearch('  Configurações ')).toBe('configuracoes');
  expect(normalizeSearch('ESTOQUE')).toBe('estoque');
});
