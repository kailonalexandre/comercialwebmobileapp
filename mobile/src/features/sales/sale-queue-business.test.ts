import { emptyDraft } from '@/features/presale/draft-model';
import { belongsTo, type SaleQueueEntry } from '@/features/sales/sale-queue-model';

const entry = (businessId?: number): SaleQueueEntry => ({ id: 'k', kind: 'pdv', draft: emptyDraft, status: 'pending', businessId, createdAt: '2026-10-06T10:00:00Z' });

describe('belongsTo (fila separada por empresa)', () => {
  it('venda de uma empresa não sobe nem aparece em outra', () => {
    expect(belongsTo(entry(10), 10)).toBe(true);
    expect(belongsTo(entry(10), 20)).toBe(false);
  });
  it('sem empresa conhecida (dado antigo ou sessão carregando) vale para qualquer uma', () => {
    expect(belongsTo(entry(undefined), 20)).toBe(true);
    expect(belongsTo(entry(10), null)).toBe(true);
    expect(belongsTo(entry(10), undefined)).toBe(true);
  });
});

describe('belongsTo (fila separada por conta do aparelho)', () => {
  const byAccount = (accountId?: string): SaleQueueEntry => ({ ...entry(10), accountId });
  it('venda de um vendedor não sobe na sessão de outro, mesmo na mesma empresa', () => {
    expect(belongsTo(byAccount('ana'), 10, 'ana')).toBe(true);
    expect(belongsTo(byAccount('ana'), 10, 'bia')).toBe(false);
  });
  it('dado antigo (sem conta) ou conta ainda não aberta vale para qualquer uma', () => {
    expect(belongsTo(byAccount(undefined), 10, 'bia')).toBe(true);
    expect(belongsTo(byAccount('ana'), 10, null)).toBe(true);
  });
});
