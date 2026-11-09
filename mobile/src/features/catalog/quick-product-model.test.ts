import { centsFromDigits, emptyProduct, toProductRequest, validateProduct } from '@/features/catalog/quick-product-model';

const ok = { ...emptyProduct(), name: ' Camiseta ', saleCents: '1990' };

describe('quick product', () => {
  it('só nome e preço de venda são obrigatórios', () => {
    expect(validateProduct(ok)).toEqual({});
    expect(validateProduct({ ...ok, name: ' ' }).name).toBeDefined();
    expect(validateProduct({ ...ok, saleCents: '' }).saleCents).toBeDefined();
    expect(validateProduct({ ...ok, saleCents: '0' })).toEqual({});
  });
  it('preço vira centavos e o vazio é omitido', () => {
    expect(centsFromDigits('R$ 19,90')).toBe(1990);
    expect(centsFromDigits('')).toBeNull();
    expect(toProductRequest(ok)).toEqual({ name: 'Camiseta', sku: undefined, barcode: undefined, salePriceCents: 1990, costPriceCents: undefined });
    expect(toProductRequest({ ...ok, costCents: '500', barcode: ' 789 ' })).toMatchObject({ barcode: '789', costPriceCents: 500 });
  });
});
