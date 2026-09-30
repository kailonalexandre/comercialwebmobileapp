import { createDraftStore } from '@/features/presale/draft-context';
import { sendPreSale } from '@/features/presale/presale-api';

// Rascunho da pré-venda (Nova Venda no Início).
export const { DraftProvider: PreSaleDraftProvider, useDraft: usePreSaleDraft } = createDraftStore(sendPreSale);
