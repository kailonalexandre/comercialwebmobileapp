import { createDraftStore } from '@/features/presale/draft-context';
import { sendPdvSale } from '@/features/pdv/pdv-api';

// Rascunho do PDV (aba central). Separado da pré-venda: cada um guarda o seu pedido e a sua chave.
export const { DraftProvider: PdvDraftProvider, useDraft: usePdvDraft } = createDraftStore(sendPdvSale);
