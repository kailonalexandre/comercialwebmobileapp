import { addItem, addPayment, canSend, changeCents, parseMoney, paidCents, remainingCents, toSaleRequest, emptyDraft, estimateCents, parseQuantity, removeItem, setQuantity, toRequest } from '@/features/presale/draft-model';

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
  const draft = { customer: { id: 7, name: 'Maria' }, observation: '  entregar cedo ', items: [{ ...camiseta, quantity: 2 }], payments: [] };
  expect(toRequest(draft)).toEqual({ customerId: 7, observation: 'entregar cedo', items: [{ productId: 1, quantity: 2 }] });
  expect(JSON.stringify(toRequest(draft))).not.toMatch(/price|total|Price/);
});

test('sem itens não envia', () => {
  expect(canSend(emptyDraft)).toBe(false);
  expect(canSend({ ...emptyDraft, items: [{ ...camiseta, quantity: 1 }] })).toBe(true);
});

test('pagamentos: soma por forma, restante e troco contra o total do servidor', () => {
  const dinheiro = { method: 'cash', label: 'Dinheiro', amountCents: 2000 };
  const pix = { method: 'pix_transfer', label: 'Pix', amountCents: 1500 };
  let pays = addPayment(addPayment([], dinheiro), pix);
  pays = addPayment(pays, { ...dinheiro, amountCents: 500 });
  expect(pays).toHaveLength(2);
  expect(paidCents(pays)).toBe(4000);
  expect(remainingCents(5000, pays)).toBe(1000);
  expect(changeCents(3500, pays)).toBe(500);
  expect(addPayment([], { ...dinheiro, amountCents: 0 })).toEqual([]);
});

test('valor em reais vira centavos e recusa lixo', () => {
  expect(parseMoney('12,50')).toBe(1250);
  expect(parseMoney('12.5')).toBe(1250);
  expect(parseMoney('7')).toBe(700);
  for (const bad of ['', '0', '0,00', '-3', 'abc', '1,234', '12345678']) expect(parseMoney(bad)).toBeNull();
});

test('pedido do PDV leva formas e valores, nunca preço', () => {
  const draft = { customer: null, observation: '', items: [{ ...camiseta, quantity: 1 }], payments: [{ method: 'cash', label: 'Dinheiro', amountCents: 5000 }] };
  expect(toSaleRequest(draft).payments).toEqual([{ method: 'cash', amountCents: 5000 }]);
  expect(JSON.stringify(toSaleRequest(draft))).not.toMatch(/unitPrice|totalCents|label/);
});
