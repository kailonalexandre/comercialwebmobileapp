import { searchCached } from '@/features/customers/customer-cache-model';
import type { Customer } from '@/features/customers/customers-api';

const c = (id: number, name: string, extra: Partial<Customer> = {}): Customer => ({
  id, code: id, name, tradeName: null, document: null, phone: null, city: null, state: null, isActive: true, restrictionAlert: false, restrictionBlock: false, ...extra,
});
const all = [c(1, 'João da Silva', { phone: '(11) 98888-7777' }), c(2, 'Mercado Bom Preço', { tradeName: 'Bom Preço', document: '12345678000190' }), c(3, 'Ana')];

describe('searchCached', () => {
  it('ignora acento e caixa; acha por fantasia', () => {
    expect(searchCached(all, 'joao', 1, 20).items.map((x) => x.id)).toEqual([1]);
    expect(searchCached(all, 'BOM PRECO', 1, 20).items.map((x) => x.id)).toEqual([2]);
  });
  it('acha por dígitos de telefone e documento, com ou sem máscara', () => {
    expect(searchCached(all, '98888', 1, 20).items.map((x) => x.id)).toEqual([1]);
    expect(searchCached(all, '12.345.678', 1, 20).items.map((x) => x.id)).toEqual([2]);
  });
  it('pagina e informa o total', () => {
    const r = searchCached(all, '', 2, 2);
    expect(r).toMatchObject({ page: 2, total: 3 });
    expect(r.items.map((x) => x.id)).toEqual([3]);
  });
});
