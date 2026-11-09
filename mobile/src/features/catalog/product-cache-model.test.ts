import { searchProducts } from '@/features/catalog/product-cache-model';
import type { Product } from '@/features/catalog/products-api';

const p = (id: number, name: string, extra: Partial<Product> = {}): Product => ({ id, code: id, name, sku: null, barcode: null, salePriceCents: 100, isActive: true, priceCents: 100, ...extra });
const all = [p(1, 'Camiseta Básica', { sku: 'CAM-01' }), p(2, 'Calça Jeans', { barcode: '7891234567895' }), p(3, 'Boné')];

describe('searchProducts', () => {
  it('ignora acento e caixa', () => {
    expect(searchProducts(all, 'camiseta basica', 1, 20).items.map((x) => x.id)).toEqual([1]);
    expect(searchProducts(all, 'BONE', 1, 20).items.map((x) => x.id)).toEqual([3]);
  });
  it('acha por SKU, código e código de barras exato (leitor)', () => {
    expect(searchProducts(all, 'cam-01', 1, 20).items.map((x) => x.id)).toEqual([1]);
    expect(searchProducts(all, '3', 1, 20).items.map((x) => x.id)).toEqual([3]);
    expect(searchProducts(all, '7891234567895', 1, 20).items.map((x) => x.id)).toEqual([2]);
  });
  it('pagina e informa o total', () => {
    expect(searchProducts(all, '', 2, 2)).toMatchObject({ total: 3, items: [{ id: 3 }] });
  });
});
