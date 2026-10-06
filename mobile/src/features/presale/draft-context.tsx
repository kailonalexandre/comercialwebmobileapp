import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/features/auth/session-context';
import { emptyDraft, type Draft } from '@/features/presale/draft-model';
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

    const send = useCallback(async () => {
      setPhase({ name: 'sending' });
      const result = await submitSale(kind, draft, key, businessId);
      if (result.kind === 'ok') setPhase({ name: 'done', sale: result.sale });
      else if (result.kind === 'rejected') setPhase({ name: 'editing', error: result.message, code: result.code, totalCents: result.totalCents });
      else if (result.kind === 'forbidden') setPhase({ name: 'editing', error: 'Você não tem permissão para esta operação.' });
      else setPhase({ name: 'queued' });
    }, [draft, key, businessId]);

    const reset = useCallback(() => {
      setDraftState(emptyDraft);
      setPhase({ name: 'editing' });
      setKey(randomUUID());
    }, []);

    const value = useMemo(() => ({ draft, phase, setDraft, send, reset }), [draft, phase, setDraft, send, reset]);
    return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
  }

  function useDraft(): DraftValue {
    const value = useContext(DraftContext);
    if (!value) throw new Error('useDraft fora do provider');
    return value;
  }

  return { DraftProvider, useDraft };
}
