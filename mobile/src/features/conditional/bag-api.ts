import type { Bag, BagMoveKind } from '@/features/conditional/bag-model';
import { api } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';

export type BagPayment = { method: string; amountCents: number };

// Mesmas formas imediatas do PDV do app (o ComercialWeb confere quais a empresa tem ativas).
export const BAG_PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: 'cash', label: 'Dinheiro' },
  { key: 'pix_transfer', label: 'Pix' },
  { key: 'debit_card', label: 'Débito' },
  { key: 'credit_card', label: 'Crédito' },
];

// Só no modo sem API (dados fictícios): a baixa altera esta sacola para a tela poder ser exercitada de ponta a ponta.
let devBag: Bag = {
  id: 1, number: 'C000001', status: 'aberto', customerId: 1, customerName: 'Maria Souza', totalCents: 4500, createdAt: '2026-10-12T09:00:00-03:00',
  items: [{ id: 1, productId: 1, description: 'Blusa M', sku: 'B-M', unitPriceCents: 1500, quantity: 3, sold: 0, returned: 0, pending: 3 }],
};

export async function fetchOpenBags(): Promise<Bag[]> {
  if (!api) return [devBag];
  return (await api.request<{ data: Bag[] }>('/v1/conditionals/open')).data;
}

export async function fetchBag(id: number): Promise<Bag> {
  if (!api) return devBag;
  return api.request<Bag>(`/v1/conditionals/${id}`);
}

export type MoveResult = { kind: 'ok'; bag: Bag } | { kind: 'rejected'; message: string } | { kind: 'forbidden' } | { kind: 'uncertain' };

/** Uma baixa. `key` se repete em toda retentativa: o servidor responde "já existia" em vez de baixar de novo. */
export async function sendMove(conditionalId: number, itemId: number, kind: BagMoveKind, quantity: number, key: string): Promise<MoveResult> {
  try {
    if (!api) {
      devBag = { ...devBag, items: devBag.items.map((i) => (i.id === itemId ? { ...i, [kind]: i[kind] + quantity, pending: i.pending - quantity } : i)) };
      return { kind: 'ok', bag: devBag };
    }
    const r = await api.request<{ conditional: Bag }>(`/v1/conditionals/${conditionalId}/movements`, { method: 'POST', body: { itemId, kind, quantity }, idempotencyKey: key });
    return { kind: 'ok', bag: r.conditional };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.kind === 'validation') return { kind: 'rejected', message: e.serverMessage ?? 'Baixa recusada. Confira a sacola e tente de novo.' };
      if (e.kind === 'forbidden') return { kind: 'forbidden' };
    }
    return { kind: 'uncertain' };
  }
}

/** Encerra com o recebimento (precisa de conexão: o valor sai do total que o servidor calculou). Encerrar de novo é seguro. */
export async function finalizeBag(conditionalId: number, payments: BagPayment[]): Promise<Bag> {
  if (!api) return { ...devBag, status: 'finalizado', totalCents: devBag.totalCents };
  return (await api.request<{ conditional: Bag }>(`/v1/conditionals/${conditionalId}/finalize`, { method: 'POST', body: { payments } })).conditional;
}
