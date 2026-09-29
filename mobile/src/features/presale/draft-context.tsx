import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { emptyDraft, type Draft } from '@/features/presale/draft-model';
import type { PreSaleCreated, SendResult } from '@/features/presale/presale-api';

// editing: pode mexer. sending: em voo. uncertain: pode ter sido criada; conteúdo travado, só reenviar
// (mesma chave) ou descartar. done: criada.
export type Phase =
  | { name: 'editing'; error?: string; code?: string; totalCents?: number }
  | { name: 'sending' }
  | { name: 'uncertain' }
  | { name: 'done'; sale: PreSaleCreated };

export type DraftValue = {
  draft: Draft;
  phase: Phase;
  setDraft: (change: (d: Draft) => Draft) => void;
  send: () => Promise<void>;
  reset: () => void;
};

export type DraftSender = (draft: Draft, key: string) => Promise<SendResult>;

/**
 * Rascunho com chave de idempotência, para pré-venda e PDV (cada um com o seu envio).
 * A chave nasce uma vez por pedido e só troca em reset(): toda retentativa usa a mesma.
 */
export function createDraftStore(sender: DraftSender) {
  const DraftContext = createContext<DraftValue | null>(null);

  function DraftProvider({ children }: { children: ReactNode }) {
    const [draft, setDraftState] = useState<Draft>(emptyDraft);
    const [phase, setPhase] = useState<Phase>({ name: 'editing' });
    const [key, setKey] = useState(() => randomUUID());

    // A tela trava a edição fora da fase 'editing': a mesma chave precisa do mesmo pedido.
    const setDraft = useCallback((change: (d: Draft) => Draft) => setDraftState((d) => change(d)), []);

    const send = useCallback(async () => {
      setPhase({ name: 'sending' });
      const result = await sender(draft, key);
      if (result.kind === 'ok') setPhase({ name: 'done', sale: result.sale });
      else if (result.kind === 'rejected') setPhase({ name: 'editing', error: result.message, code: result.code, totalCents: result.totalCents });
      else if (result.kind === 'forbidden') setPhase({ name: 'editing', error: 'Você não tem permissão para esta operação.' });
      else setPhase({ name: 'uncertain' });
    }, [draft, key]);

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
