import type { Draft } from '@/features/presale/draft-model';
import type { SendResult } from '@/features/presale/presale-api';
import { api } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';

// Só salvar: finalizar o condicional continua no ComercialWeb. Preço e total nunca são enviados (o servidor calcula),
// e o cliente é obrigatório (condicional para "Consumidor final" a web recusa por padrão).
export function toConditionalRequest(draft: Draft) {
  return {
    customerId: draft.customer && !draft.customer.pendingId ? draft.customer.id : null,
    priceTable: draft.priceTable,
    observation: draft.observation.trim() || null,
    items: draft.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  };
}

export const canSaveConditional = (draft: Draft) => draft.items.length > 0 && draft.customer !== null;

type Created = { conditionalId: number; number: string; status: string; totalCents: number; alreadyExisted: boolean };

/**
 * Envia o condicional. `key` nasce com a sacola e se repete em toda retentativa: o servidor a usa como client_uuid
 * e responde "já existia" em vez de criar outro (e de baixar o estoque de novo). Mesmo contrato de resultado da venda:
 * recusa = nada foi criado; incerto (rede, timeout, 5xx) = continua na fila.
 */
export async function sendConditional(draft: Draft, key: string): Promise<SendResult> {
  try {
    if (!api) {
      if (!__DEV__) throw new Error('API não configurada.');
      return { kind: 'ok', sale: { saleId: 1, number: 'C000099', status: 'aberto', totalCents: draft.items.reduce((s, i) => s + Math.round(i.unitPriceCents * i.quantity), 0), alreadyExisted: false } };
    }
    const created = await api.request<Created>('/v1/conditionals', { method: 'POST', body: toConditionalRequest(draft), idempotencyKey: key });
    // O comprovante é o mesmo da venda; aqui o "id da venda" é o id do condicional.
    return { kind: 'ok', sale: { saleId: created.conditionalId, number: created.number, status: created.status, totalCents: created.totalCents, alreadyExisted: created.alreadyExisted } };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.kind === 'validation') return { kind: 'rejected', message: e.serverMessage ?? 'Confira os dados do condicional e tente de novo.' };
      if (e.kind === 'forbidden') return { kind: 'forbidden' };
    }
    return { kind: 'uncertain' };
  }
}
