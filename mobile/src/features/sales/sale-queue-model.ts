import type { SyncStatus } from '@/features/customers/quick-customer-model';
import type { Draft } from '@/features/presale/draft-model';
import type { PreSaleCreated, SendResult } from '@/features/presale/presale-api';

export type SaleKind = 'pdv' | 'presale';

export const KIND_LABEL: Record<SaleKind, string> = { pdv: 'Venda', presale: 'Pré-venda' };

// Toda venda passa por aqui antes de ir ao servidor: `id` é a Idempotency-Key (client_sale_uuid) e nasce
// com o pedido, então reenviar depois de queda, de toque duplo ou de app fechado nunca duplica a venda.
export type SaleQueueEntry = {
  id: string;
  kind: SaleKind;
  draft: Draft;
  status: SyncStatus;
  error?: string;
  code?: string;
  totalCents?: number;
  sale?: PreSaleCreated;
  // Empresa da sessão que gravou o pedido (se já conhecida): venda de uma empresa nunca sobe na sessão de outra.
  businessId?: number;
  createdAt: string;
};

// ok -> sincronizada; recusa -> erro (nada foi criado, precisa de decisão); incerto (rede/timeout/5xx) -> continua na fila.
export function applyResult(entry: SaleQueueEntry, result: SendResult): SaleQueueEntry {
  switch (result.kind) {
    case 'ok':
      return { ...entry, status: 'synced', sale: result.sale, error: undefined, code: undefined };
    case 'rejected':
      return { ...entry, status: 'error', error: result.message, code: result.code, totalCents: result.totalCents };
    case 'forbidden':
      return { ...entry, status: 'error', error: 'Você não tem permissão para esta operação.', code: 'forbidden' };
    case 'uncertain':
      return { ...entry, status: 'pending' };
  }
}

// App fechado no meio do envio: volta para a fila (o reenvio é seguro por causa da chave).
export const restore = (entries: SaleQueueEntry[]): SaleQueueEntry[] =>
  entries.map((e) => (e.status === 'syncing' ? { ...e, status: 'pending' as const } : e));

// Venda de uma empresa nunca sobe nem aparece em outra. Sem empresa conhecida (dado antigo ou sessão ainda carregando), vale para qualquer uma.
export const belongsTo = (entry: SaleQueueEntry, businessId: number | null | undefined) =>
  entry.businessId === undefined || businessId == null || entry.businessId === businessId;
