// Desconto é só a intenção do vendedor: percentual (0 a 99,99) OU valor em centavos. O ComercialWeb aplica e limita.
export type Discount = { kind: 'percent'; percent: number } | { kind: 'value'; cents: number };

export type DraftItem = { productId: number; name: string; unitPriceCents: number; quantity: number; discount?: Discount };

// Valor recebido por forma de pagamento (só o PDV usa; a pré-venda não recebe).
export type PaymentLine = { method: string; label: string; amountCents: number };

export type Draft = {
  customer: { id: number; name: string } | null;
  observation: string;
  items: DraftItem[];
  payments: PaymentLine[];
  saleDiscount?: Discount;
};

export const emptyDraft: Draft = { customer: null, observation: '', items: [], payments: [] };

// Limites do servidor (FormRequest do ComercialWeb): recusar aqui poupa a ida e volta.
export const MAX_ITEMS = 200;
export const MAX_QUANTITY = 99_999;
export const MAX_OBSERVATION = 1000;

// "2,5" -> 2.5. Aceita vírgula ou ponto; até 3 casas; > 0 e <= MAX_QUANTITY. Inválido = null.
export function parseQuantity(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > MAX_QUANTITY) return null;
  return Math.round(n * 1000) / 1000 === n ? n : null;
}

// Somar a mesma mercadoria duas vezes vira uma linha só.
export function addItem(items: DraftItem[], item: Omit<DraftItem, 'quantity'>, quantity = 1): DraftItem[] {
  const existing = items.find((i) => i.productId === item.productId);
  if (existing) {
    const total = Math.min(Math.round((existing.quantity + quantity) * 1000) / 1000, MAX_QUANTITY);
    return items.map((i) => (i === existing ? { ...i, quantity: total } : i));
  }
  return items.length >= MAX_ITEMS ? items : [...items, { ...item, quantity }];
}

export const setQuantity = (items: DraftItem[], productId: number, quantity: number): DraftItem[] =>
  items.map((i) => (i.productId === productId ? { ...i, quantity } : i));

export const removeItem = (items: DraftItem[], productId: number): DraftItem[] => items.filter((i) => i.productId !== productId);

// "10,5" -> { percent: 10.5 }; "12,50" -> { cents: 1250 }. Vazio, inválido ou fora do limite = null.
export function parseDiscount(kind: Discount['kind'], text: string): Discount | null {
  if (kind === 'value') {
    const cents = parseMoney(text);
    return cents === null ? null : { kind, cents };
  }
  const m = /^\s*(\d{1,2})(?:[.,](\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const percent = Number(`${m[1]}.${m[2] ?? '0'}`);
  return percent > 0 && percent <= 99.99 ? { kind, percent } : null;
}

// Texto para o campo de edição (inverso de parseDiscount).
export function discountText(d: Discount | undefined): string {
  if (!d) return '';
  return d.kind === 'percent' ? String(d.percent).replace('.', ',') : (d.cents / 100).toFixed(2).replace('.', ',');
}

// Campos do contrato da API: um só por par (percentual OU valor), no item ou na venda.
export function discountFields(d: Discount | undefined, scope: 'item' | 'sale' = 'item'): Record<string, number> {
  if (!d) return {};
  const [percentKey, centsKey] = scope === 'sale' ? ['saleDiscountPercent', 'saleDiscountCents'] : ['discountPercent', 'discountCents'];
  return d.kind === 'percent' ? { [percentKey]: d.percent } : { [centsKey]: d.cents };
}

const discountOf = (base: number, d: Discount | undefined): number =>
  d === undefined ? 0 : Math.min(base, d.kind === 'percent' ? Math.round((base * d.percent) / 100) : d.cents);

// Só estimativa para o usuário: o servidor recalcula preço, desconto e total.
export const estimateCents = (items: DraftItem[], saleDiscount?: Discount): number => {
  const subtotal = items.reduce((sum, i) => {
    const base = Math.round(i.unitPriceCents * i.quantity);
    return sum + base - discountOf(base, i.discount);
  }, 0);
  return subtotal - discountOf(subtotal, saleDiscount);
};

// O que vai no corpo do pedido. Preço e total nunca são enviados.
export function toRequest(draft: Draft) {
  return {
    customerId: draft.customer?.id ?? null,
    observation: draft.observation.trim() || null,
    items: draft.items.map((i) => ({ productId: i.productId, quantity: i.quantity, ...discountFields(i.discount) })),
    ...discountFields(draft.saleDiscount, 'sale'),
  };
}

export const canSend = (draft: Draft) =>
  draft.items.length > 0 && draft.items.length <= MAX_ITEMS && draft.observation.length <= MAX_OBSERVATION;

export const MAX_PAYMENTS = 8;

// Uma linha por forma: receber de novo na mesma forma soma no valor.
export function addPayment(payments: PaymentLine[], line: PaymentLine): PaymentLine[] {
  if (line.amountCents <= 0) return payments;
  const existing = payments.find((p) => p.method === line.method);
  if (existing) return payments.map((p) => (p === existing ? { ...p, amountCents: p.amountCents + line.amountCents } : p));
  return payments.length >= MAX_PAYMENTS ? payments : [...payments, line];
}

export const removePayment = (payments: PaymentLine[], method: string): PaymentLine[] => payments.filter((p) => p.method !== method);

export const paidCents = (payments: PaymentLine[]): number => payments.reduce((sum, p) => sum + p.amountCents, 0);

// Contra o total que o SERVIDOR cotou: quanto falta e quanto volta de troco.
export const remainingCents = (totalCents: number, payments: PaymentLine[]): number => Math.max(0, totalCents - paidCents(payments));
export const changeCents = (totalCents: number, payments: PaymentLine[]): number => Math.max(0, paidCents(payments) - totalCents);

// "12,50" ou "12.5" -> 1250. Inválido, zero ou negativo = null.
export function parseMoney(text: string): number | null {
  const m = /^\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

export const toSaleRequest = (draft: Draft) => ({
  ...toRequest(draft),
  payments: draft.payments.map((p) => ({ method: p.method, amountCents: p.amountCents })),
});
