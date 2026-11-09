import { canFinalize, pendingTotal, validMoveQuantity, withQueued, type Bag, type BagMove } from '@/features/conditional/bag-model';

const bag: Bag = {
  id: 1, number: 'C1', status: 'aberto', customerId: 7, customerName: 'Maria', totalCents: 3000, createdAt: null,
  items: [{ id: 10, productId: 100, description: 'Blusa', sku: null, unitPriceCents: 1500, quantity: 2, sold: 0, returned: 0, pending: 2 }],
};
const item = bag.items[0]!;
const move = (kind: 'sold' | 'returned', quantity: number, status: BagMove['status'] = 'pending'): BagMove => ({
  id: `${kind}${quantity}`, conditionalId: 1, itemId: 10, kind, quantity, status, createdAt: '2026-10-12T10:00:00Z',
});

describe('bag-model', () => {
  it('aplica as baixas guardadas sem mexer na sacola original', () => {
    const view = withQueued(bag, [move('sold', 1), move('returned', 1)]);
    expect(view.items[0]!).toMatchObject({ sold: 1, returned: 1, pending: 0 });
    expect(item.pending).toBe(2);
  });

  it('baixa recusada pelo servidor deixa de contar', () => {
    expect(withQueued(bag, [move('sold', 1, 'error')]).items[0]!.pending).toBe(2);
  });

  it('só aceita quantidade até o que está com o vendedor', () => {
    expect(validMoveQuantity(item, 2)).toBe(true);
    expect(validMoveQuantity(item, 3)).toBe(false);
    expect(validMoveQuantity(item, 0)).toBe(false);
    expect(validMoveQuantity(item, 0.0005)).toBe(false);
  });

  it('só finaliza com tudo baixado e a fila vazia', () => {
    const done = withQueued(bag, [move('sold', 2)]);
    expect(pendingTotal(done)).toBe(0);
    expect(canFinalize(done, [move('sold', 2)])).toBe(false);
    expect(canFinalize({ ...bag, items: [{ ...item, sold: 2, pending: 0 }] }, [])).toBe(true);
    expect(canFinalize(bag, [])).toBe(false);
  });
});
