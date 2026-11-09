import { createDraftStore } from '@/features/presale/draft-context';

// Rascunho (sacola) do condicional. Separado da pré-venda e do PDV: cada um guarda o seu pedido e a sua chave.
export const { DraftProvider: ConditionalDraftProvider, useDraft: useConditionalDraft } = createDraftStore('conditional');
