import { canSaveConditional, toConditionalRequest } from '@/features/conditional/conditional-api';
import { addItem, emptyDraft, type Draft } from '@/features/presale/draft-model';

const item = { productId: 7, name: 'Camiseta', unitPriceCents: 4990 };
const draft = (extra: Partial<Draft> = {}): Draft => ({ ...emptyDraft, items: addItem([], item, 2), customer: { id: 5, name: 'Maria' }, ...extra });

describe('toConditionalRequest', () => {
  it('manda só cliente, tabela, observação e itens (nunca preço nem total)', () => {
    expect(toConditionalRequest(draft({ observation: ' levar quinta ' }))).toEqual({
      customerId: 5, priceTable: 'varejo', observation: 'levar quinta', items: [{ productId: 7, quantity: 2 }],
    });
  });
  it('cliente com cadastro pendente não manda id inventado', () => {
    expect(toConditionalRequest(draft({ customer: { id: 0, name: 'Novo', pendingId: 'k1' } })).customerId).toBeNull();
  });
});

describe('canSaveConditional', () => {
  it('exige cliente e ao menos um item', () => {
    expect(canSaveConditional(draft())).toBe(true);
    expect(canSaveConditional(draft({ customer: null }))).toBe(false);
    expect(canSaveConditional(draft({ items: [] }))).toBe(false);
  });
});
