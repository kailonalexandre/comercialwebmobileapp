import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { useSession } from '@/features/auth/session-context';
import { addItem, emptyDraft, type Draft, type DraftItem } from '@/features/presale/draft-model';
import type { PreSaleCreated } from '@/features/presale/presale-api';
import { submitSale } from '@/features/sales/sale-queue';
import type { SaleKind } from '@/features/sales/sale-queue-model';

// editing: pode mexer. sending: em voo. queued: sem confirmação do servidor; a venda está guardada no aparelho
// (fila) e sobe sozinha com a mesma chave. done: criada.
export type Phase =
  | { name: 'editing'; error?: string; code?: string; totalCents?: number }
  | { name: 'sending' }
  | { name: 'queued' }
  | { name: 'done'; sale: PreSaleCreated };

export type DraftValue = {
  draft: Draft;
  phase: Phase;
  setDraft: (change: (d: Draft) => Draft) => void;
  send: () => Promise<void>;
  reset: () => void;
  // Reabre um pedido recusado para o operador corrigir (nada foi criado no servidor).
  load: (draft: Draft) => void;
  // Lança um produto (quantidade 1, ou soma na linha dele) e marca a linha para o campo de quantidade ganhar o foco.
  add: (item: Omit<DraftItem, 'quantity'>) => void;
  // Última linha lançada; `seq` muda a cada lançamento, mesmo do mesmo produto.
  lastAdded: { productId: number; seq: number } | null;
};

/**
 * Rascunho com chave de idempotência, para pré-venda e PDV. O envio passa pela fila local (sale-queue).
 * A chave nasce uma vez por pedido e só troca em reset(): toda retentativa usa a mesma.
 */
export function createDraftStore(kind: SaleKind) {
  const DraftContext = createContext<DraftValue | null>(null);

  function DraftProvider({ children }: { children: ReactNode }) {
    const [draft, setDraftState] = useState<Draft>(emptyDraft);
    const [phase, setPhase] = useState<Phase>({ name: 'editing' });
    const [key, setKey] = useState(() => randomUUID());
    const businessId = useSession().profile?.businessId;

    // A tela trava a edição fora da fase 'editing': a mesma chave precisa do mesmo pedido.
    const setDraft = useCallback((change: (d: Draft) => Draft) => setDraftState((d) => change(d)), []);

    const [lastAdded, setLastAdded] = useState<{ productId: number; seq: number } | null>(null);
    const add = useCallback((item: Omit<DraftItem, 'quantity'>) => {
      setDraftState((d) => ({ ...d, items: addItem(d.items, item) }));
      setLastAdded((prev) => ({ productId: item.productId, seq: (prev?.seq ?? 0) + 1 }));
    }, []);

    // Dois toques em "Confirmar" antes de a tela travar não viram duas vendas (o servidor também deduplica pela chave).
    const inFlight = useRef(false);
    const send = useCallback(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPhase({ name: 'sending' });
      try {
        const result = await submitSale(kind, draft, key, businessId);
        if (result.kind === 'ok') setPhase({ name: 'done', sale: result.sale });
        else if (result.kind === 'rejected') setPhase({ name: 'editing', error: result.message, code: result.code, totalCents: result.totalCents });
        else if (result.kind === 'forbidden') setPhase({ name: 'editing', error: 'Você não tem permissão para esta operação.' });
        else setPhase({ name: 'queued' });
      } finally {
        inFlight.current = false;
      }
    }, [draft, key, businessId]);

    const reset = useCallback(() => {
      setDraftState(emptyDraft);
      setPhase({ name: 'editing' });
      setKey(randomUUID());
    }, []);

    const load = useCallback((next: Draft) => {
      setDraftState(next);
      setPhase({ name: 'editing' });
      setKey(randomUUID());
    }, []);

    const value = useMemo(() => ({ draft, phase, setDraft, send, reset, load, add, lastAdded }), [draft, phase, setDraft, send, reset, load, add, lastAdded]);
    return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
  }

  function useDraft(): DraftValue {
    const value = useContext(DraftContext);
    if (!value) throw new Error('useDraft fora do provider');
    return value;
  }

  return { DraftProvider, useDraft };
}
