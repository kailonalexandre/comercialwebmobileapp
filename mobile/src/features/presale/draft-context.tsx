import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { emptyDraft, type Draft } from '@/features/presale/draft-model';
import { sendPreSale, type PreSaleCreated } from '@/features/presale/presale-api';

// editing: pode mexer. sending: em voo. uncertain: pode ter sido criada; conteúdo travado, só reenviar
// (mesma chave) ou descartar. done: criada.
export type Phase =
  | { name: 'editing'; error?: string }
  | { name: 'sending' }
  | { name: 'uncertain' }
  | { name: 'done'; sale: PreSaleCreated };

type Value = {
  draft: Draft;
  phase: Phase;
  setDraft: (change: (d: Draft) => Draft) => void;
  send: () => Promise<void>;
  reset: () => void;
};

const DraftContext = createContext<Value | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<Draft>(emptyDraft);
  const [phase, setPhase] = useState<Phase>({ name: 'editing' });
  // Uma chave por pedido, gerada aqui e só trocada por reset().
  const [key, setKey] = useState(() => randomUUID());

  // A tela trava a edição fora da fase 'editing': a mesma chave precisa do mesmo pedido.
  const setDraft = useCallback((change: (d: Draft) => Draft) => setDraftState((d) => change(d)), []);

  const send = useCallback(async () => {
    setPhase({ name: 'sending' });
    const result = await sendPreSale(draft, key);
    if (result.kind === 'ok') setPhase({ name: 'done', sale: result.sale });
    else if (result.kind === 'rejected') setPhase({ name: 'editing', error: result.message });
    else if (result.kind === 'forbidden') setPhase({ name: 'editing', error: 'Você não tem permissão para lançar pré-vendas.' });
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

export function useDraft(): Value {
  const value = useContext(DraftContext);
  if (!value) throw new Error('useDraft fora de DraftProvider');
  return value;
}
