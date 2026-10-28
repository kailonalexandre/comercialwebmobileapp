import { addItem, setPrice, priceOf, newestFirst, stepQuantity, toggleDiscount, discountText, parseDiscount, addPayment, canSend, changeCents, parseMoney, paidCents, remainingCents, toSaleRequest, emptyDraft, estimateCents, parseQuantity, removeItem, setQuantity, toRequest } from '@/features/presale/draft-model';

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
  const draft = { priceTable: 'varejo', customer: { id: 7, name: 'Maria' }, observation: '  entregar cedo ', items: [{ ...camiseta, quantity: 2 }], payments: [] };
  expect(toRequest(draft)).toEqual({ priceTable: 'varejo', customerId: 7, observation: 'entregar cedo', items: [{ productId: 1, quantity: 2 }] });
  // O preço nunca vai: só a tabela escolhida, e o servidor calcula.
  expect(JSON.stringify(toRequest(draft))).not.toMatch(/unitPrice|total|Cents":\d+,"quantity/i);
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
  const draft = { priceTable: 'atacado', customer: null, observation: '', items: [{ ...camiseta, quantity: 1 }], payments: [{ method: 'cash', label: 'Dinheiro', amountCents: 5000 }] };
  expect(toSaleRequest(draft).payments).toEqual([{ method: 'cash', amountCents: 5000 }]);
  expect(toSaleRequest(draft).priceTable).toBe('atacado');
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

describe('cliente com cadastro pendente', () => {
  it('não manda id inventado ao servidor', () => {
    const draft = { ...emptyDraft, customer: { id: 0, name: 'Novo', pendingId: 'k1' } };
    expect(toRequest(draft).customerId).toBeNull();
    expect(toRequest({ ...draft, customer: { id: 7, name: 'Novo' } }).customerId).toBe(7);
  });
});

test('produto entra com quantidade 1 e o último lançado aparece primeiro; o pedido mantém a ordem de lançamento', () => {
  const calca = { productId: 2, name: 'Calça', unitPriceCents: 9_990 };
  let items = addItem(addItem([], camiseta), calca);
  expect(items.map((i) => i.quantity)).toEqual([1, 1]);
  expect(newestFirst(items).map((i) => i.name)).toEqual(['Calça', 'Camiseta']);
  expect(toRequest({ ...emptyDraft, items }).items.map((i) => i.productId)).toEqual([1, 2]);
  // Lançar de novo um que já estava: soma e vira o mais recente.
  items = addItem(items, camiseta);
  expect(newestFirst(items).map((i) => [i.name, i.quantity])).toEqual([['Camiseta', 2], ['Calça', 1]]);
});

test('− e + andam de 1 em 1, sem zerar nem passar do limite', () => {
  expect(stepQuantity(1, 1)).toBe(2);
  expect(stepQuantity(9, -1)).toBe(8);
  expect(stepQuantity(1, -1)).toBe(1);
  expect(stepQuantity(0.5, -1)).toBe(0.5);
  expect(stepQuantity(2.5, -1)).toBe(1.5);
  expect(stepQuantity(99_999, 1)).toBe(99_999);
});

test('alternar R$/% converte sobre o bruto da linha, como o PDV da web', () => {
  // Bruto 49,90 x 2 = 99,80.
  expect(toggleDiscount({ kind: 'percent', percent: 10 }, 9_980)).toEqual({ kind: 'value', cents: 998 });
  expect(toggleDiscount({ kind: 'value', cents: 998 }, 9_980)).toEqual({ kind: 'percent', percent: 10 });
  expect(toggleDiscount({ kind: 'percent', percent: 12.5 }, 1_001)).toEqual({ kind: 'value', cents: 125 }); // trunca
  // 100% ou sem base: fora do que o servidor aceita, fica sem desconto.
  expect(toggleDiscount({ kind: 'value', cents: 9_980 }, 9_980)).toBeUndefined();
  expect(toggleDiscount({ kind: 'value', cents: 500 }, 0)).toBeUndefined();
});

test('preço alterado vale na estimativa e vai ao servidor; igual ao da tabela não é alteração', () => {
  let items = addItem([], camiseta);
  items = setPrice(items, 1, 3_990);
  expect(priceOf(items[0]!)).toBe(3_990);
  expect(estimateCents(items)).toBe(3_990);
  expect(toRequest({ ...emptyDraft, items }).items[0]).toEqual({ productId: 1, quantity: 1, unitPriceCents: 3_990 });
  items = setPrice(items, 1, 4_990);
  expect(items[0]!.customPriceCents).toBeUndefined();
  expect(toRequest({ ...emptyDraft, items }).items[0]).toEqual({ productId: 1, quantity: 1 });
});
