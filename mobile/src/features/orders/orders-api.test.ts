import { pageFromSections, type Order } from '@/features/orders/orders-api';

const order = { id: '1', number: 'LV-1' } as Order;
const meta = { page: 2, perPage: 20, total: 41, lastPage: 3 };
const sections = [
  { channel: 'store', failure: null, meta, items: [order] },
  { channel: 'mercadolivre', failure: 'Fonte indisponível', meta: null, items: [] },
];

test('usa a seção do canal e a paginação dela', () => {
  expect(pageFromSections(sections, 'store')).toEqual({ items: [order], page: 2, pageSize: 20, total: 41 });
});

test('fonte externa fora do ar vira erro, não lista vazia', () => {
  expect(() => pageFromSections(sections, 'mercadolivre')).toThrow();
});

test('canal ausente na resposta é lista vazia', () => {
  expect(pageFromSections([], 'store').items).toEqual([]);
});
