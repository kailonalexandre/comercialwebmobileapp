import { addItem, discountText, parseDiscount, addPayment, canSend, changeCents, parseMoney, paidCents, remainingCents, toSaleRequest, emptyDraft, estimateCents, parseQuantity, removeItem, setQuantity, toRequest } from '@/features/presale/draft-model';

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

test('desconto: percentual até 2 casas ou valor, nunca zero nem acima do limite', () => {
  expect(parseDiscount('percent', '10,5')).toEqual({ kind: 'percent', percent: 10.5 });
  expect(parseDiscount('percent', '99.99')).toEqual({ kind: 'percent', percent: 99.99 });
  for (const bad of ['', '0', '100', '1,234', 'abc', '-5']) expect(parseDiscount('percent', bad)).toBeNull();
  expect(parseDiscount('value', '12,50')).toEqual({ kind: 'value', cents: 1250 });
  expect(parseDiscount('value', '0')).toBeNull();
  expect(discountText({ kind: 'percent', percent: 10.5 })).toBe('10,5');
  expect(discountText({ kind: 'value', cents: 1250 })).toBe('12,50');
  expect(discountText(undefined)).toBe('');
});

test('corpo do pedido leva só a intenção de desconto, um campo por par, nunca preço nem total', () => {
  const draft = {
    ...emptyDraft,
    items: [
      { ...camiseta, quantity: 2, discount: { kind: 'percent' as const, percent: 10 } },
      { productId: 2, name: 'Boné', unitPriceCents: 3_000, quantity: 1, discount: { kind: 'value' as const, cents: 300 } },
      { productId: 3, name: 'Meia', unitPriceCents: 1_000, quantity: 1 },
    ],
    saleDiscount: { kind: 'value' as const, cents: 500 },
  };
  const body = toRequest(draft);
  expect(body.items[0]).toEqual({ productId: 1, quantity: 2, discountPercent: 10 });
  expect(body.items[1]).toEqual({ productId: 2, quantity: 1, discountCents: 300 });
  expect(body.items[2]).toEqual({ productId: 3, quantity: 1 });
  expect(body).toMatchObject({ saleDiscountCents: 500 });
  expect(body).not.toHaveProperty('saleDiscountPercent');
  expect(JSON.stringify(body)).not.toMatch(/unitPrice|total/i);
  expect(toRequest({ ...emptyDraft, items: [{ ...camiseta, quantity: 1 }], saleDiscount: { kind: 'percent', percent: 5 } })).toMatchObject({ saleDiscountPercent: 5 });
});

test('estimativa aplica desconto por item e na venda sem passar de zero', () => {
  const items = [{ ...camiseta, quantity: 2, discount: { kind: 'percent' as const, percent: 10 } }]; // 9980 - 998
  expect(estimateCents(items)).toBe(8_982);
  expect(estimateCents(items, { kind: 'value', cents: 982 })).toBe(8_000);
  expect(estimateCents(items, { kind: 'value', cents: 999_999 })).toBe(0);
});
