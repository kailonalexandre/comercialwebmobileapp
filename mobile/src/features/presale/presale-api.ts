import { toRequest, type Draft } from '@/features/presale/draft-model';
import { ApiError } from '@/infrastructure/api/client';
import { api } from '@/infrastructure/api';

export type PreSaleCreated = { saleId: number; number: string; status: string; totalCents: number; alreadyExisted: boolean };

// rejected = o servidor recusou (nada foi criado); uncertain = não sabemos se chegou (rede, timeout, 5xx).
export type SendResult =
  | { kind: 'ok'; sale: PreSaleCreated }
  | { kind: 'rejected'; message: string }
  | { kind: 'forbidden' }
  | { kind: 'uncertain' };

/**
 * Envia a pré-venda. `key` é gerada uma vez por pedido e reutilizada em toda retentativa:
 * o servidor a usa como client_sale_uuid e responde "já existia" em vez de duplicar.
 * O cliente HTTP nunca repete POST sozinho.
 */
export async function sendPreSale(draft: Draft, key: string): Promise<SendResult> {
  try {
    if (!api) {
      if (!__DEV__) throw new Error('API não configurada.');
      return { kind: 'ok', sale: { saleId: 99, number: 'PV000099', status: 'pre_venda', totalCents: 0, alreadyExisted: false } };
    }
    const sale = await api.request<PreSaleCreated>('/v1/pre-sales', { method: 'POST', body: toRequest(draft), idempotencyKey: key });
    return { kind: 'ok', sale };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.kind === 'validation') return { kind: 'rejected', message: e.serverMessage ?? 'Confira os dados da pré-venda e tente de novo.' };
      if (e.kind === 'forbidden') return { kind: 'forbidden' };
    }
    return { kind: 'uncertain' };
  }
}
