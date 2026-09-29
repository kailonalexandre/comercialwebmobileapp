export type DraftItem = { productId: number; name: string; unitPriceCents: number; quantity: number };

export type Draft = {
  customer: { id: number; name: string } | null;
  observation: string;
  items: DraftItem[];
};

export const emptyDraft: Draft = { customer: null, observation: '', items: [] };

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

// Só estimativa para o usuário: o servidor recalcula preço, desconto e total.
export const estimateCents = (items: DraftItem[]): number =>
  items.reduce((sum, i) => sum + Math.round(i.unitPriceCents * i.quantity), 0);

// O que vai no corpo do pedido. Preço e total nunca são enviados.
export function toRequest(draft: Draft) {
  return {
    customerId: draft.customer?.id ?? null,
    observation: draft.observation.trim() || null,
    items: draft.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  };
}

export const canSend = (draft: Draft) =>
  draft.items.length > 0 && draft.items.length <= MAX_ITEMS && draft.observation.length <= MAX_OBSERVATION;
