import { applyPrices, FALLBACK_TABLES, suggestedTable, validTable } from '@/features/pricing/price-table-model';

const tables = [...FALLBACK_TABLES, { key: 'atacado', label: 'Atacado' }];

describe('tabela de preço', () => {
  it('escolha inexistente volta para o varejo', () => {
    expect(validTable(tables, 'atacado')).toBe('atacado');
    expect(validTable(tables, 'site')).toBe('varejo');
    expect(validTable(tables, null)).toBe('varejo');
  });
  it('só sugere atacado para cliente só de atacado e se a empresa tem essa tabela', () => {
    expect(suggestedTable('wholesale', tables)).toBe('atacado');
    expect(suggestedTable('both', tables)).toBeNull();
    expect(suggestedTable('wholesale', FALLBACK_TABLES)).toBeNull();
  });
  it('recalcula e aponta o produto sem preço na tabela', () => {
    const items = [{ productId: 1, name: 'A', unitPriceCents: 100 }, { productId: 2, name: 'B', unitPriceCents: 200 }];
    expect(applyPrices(items, { '1': 80, '2': 150 })).toEqual({ items: [{ ...items[0], unitPriceCents: 80 }, { ...items[1], unitPriceCents: 150 }], missing: [] });
    expect(applyPrices(items, { '1': 80, '2': null }).missing).toEqual(['B']);
  });
});
