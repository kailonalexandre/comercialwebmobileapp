import { createDraftStore } from '@/features/presale/draft-context';

// Rascunho da pré-venda (Nova Venda no Início).
export const { DraftProvider: PreSaleDraftProvider, useDraft: usePreSaleDraft } = createDraftStore('presale');
