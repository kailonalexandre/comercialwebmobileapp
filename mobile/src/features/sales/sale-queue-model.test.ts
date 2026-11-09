import { emptyDraft } from '@/features/presale/draft-model';
import { applyResult, restore, type SaleQueueEntry } from '@/features/sales/sale-queue-model';

const entry: SaleQueueEntry = { id: 'k1', kind: 'pdv', draft: emptyDraft, status: 'syncing', createdAt: '2026-10-06T10:00:00Z' };
const sale = { saleId: 7, number: 'V000007', status: 'finalizada', totalCents: 1000, alreadyExisted: true };

describe('applyResult', () => {
  it('ok sincroniza (inclusive reenvio que o servidor já tinha)', () => {
    expect(applyResult(entry, { kind: 'ok', sale })).toMatchObject({ status: 'synced', sale });
  });
  it('recusa vira erro com a mensagem do servidor', () => {
    expect(applyResult(entry, { kind: 'rejected', message: 'Sem estoque', code: 'stock', totalCents: 5 })).toMatchObject({ status: 'error', error: 'Sem estoque', code: 'stock' });
    expect(applyResult(entry, { kind: 'forbidden' })).toMatchObject({ status: 'error', code: 'forbidden' });
  });
  it('resultado incerto mantém na fila, nunca descarta', () => {
    expect(applyResult(entry, { kind: 'uncertain' }).status).toBe('pending');
  });
});

describe('restore', () => {
  it('syncing de uma sessão anterior volta a pending; o resto fica como está', () => {
    const out = restore([entry, { ...entry, id: 'k2', status: 'error' }]);
    expect(out.map((e) => e.status)).toEqual(['pending', 'error']);
  });
});
