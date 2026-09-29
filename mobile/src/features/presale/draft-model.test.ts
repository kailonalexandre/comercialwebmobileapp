import { addItem, canSend, emptyDraft, estimateCents, parseQuantity, removeItem, setQuantity, toRequest } from '@/features/presale/draft-model';

const camiseta = { productId: 1, name: 'Camiseta', unitPriceCents: 4_990 };

test('quantidade aceita vírgula, até 3 casas, positiva e dentro do limite', () => {
  expect(parseQuantity('2,5')).toBe(2.5);
  expect(parseQuantity(' 3 ')).toBe(3);
  for (const bad of ['0', '-1', 'abc', '', '1,2345', '100000']) expect(parseQuantity(bad)).toBeNull();
});

test('mesma mercadoria soma na mesma linha', () => {
  const items = addItem(addItem([], camiseta), camiseta, 2);
  expect(items).toEqual([{ ...camiseta, quantity: 3 }]);
  expect(removeItem(items, 1)).toEqual([]);
  expect(setQuantity(items, 1, 5)[0]?.quantity).toBe(5);
});

test('estimativa em centavos sem erro de ponto flutuante', () => {
  expect(estimateCents([{ ...camiseta, quantity: 2.5 }])).toBe(12_475);
});

test('o corpo do pedido não leva preço nem total', () => {
  const draft = { customer: { id: 7, name: 'Maria' }, observation: '  entregar cedo ', items: [{ ...camiseta, quantity: 2 }] };
  expect(toRequest(draft)).toEqual({ customerId: 7, observation: 'entregar cedo', items: [{ productId: 1, quantity: 2 }] });
  expect(JSON.stringify(toRequest(draft))).not.toMatch(/price|total|Price/);
});

test('sem itens não envia', () => {
  expect(canSend(emptyDraft)).toBe(false);
  expect(canSend({ ...emptyDraft, items: [{ ...camiseta, quantity: 1 }] })).toBe(true);
});
