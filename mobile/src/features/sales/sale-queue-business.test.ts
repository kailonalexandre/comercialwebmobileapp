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
