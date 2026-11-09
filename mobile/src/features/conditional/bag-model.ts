// Sacola do vendedor: condicional aberto que saiu com ele. O servidor (ComercialWeb) é a fonte da verdade; o que o
// aparelho já anotou e ainda não subiu (fila) é aplicado por cima só para a tela não mentir.
export type BagItem = {
  id: number;
  productId: number;
  description: string;
  sku: string | null;
  unitPriceCents: number;
  quantity: number;
  sold: number;
  returned: number;
  pending: number;
};

export type Bag = {
  id: number;
  number: string;
  status: string;
  customerId: number | null;
  customerName: string | null;
  totalCents: number;
  createdAt: string | null;
  items: BagItem[];
};

export type BagMoveKind = 'sold' | 'returned';

export type BagMove = {
  id: string; // Idempotency-Key: nasce na baixa e se repete em todo reenvio
  conditionalId: number;
  itemId: number;
  kind: BagMoveKind;
  quantity: number;
  status: 'pending' | 'syncing' | 'error';
  error?: string;
  businessId?: number;
  accountId?: string; // conta do aparelho que gravou: baixa de um vendedor nunca sobe na sessão de outro
  createdAt: string;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Aplica as baixas ainda não enviadas por cima da sacola do servidor. */
export function withQueued(bag: Bag, moves: BagMove[]): Bag {
  const mine = moves.filter((m) => m.conditionalId === bag.id && m.status !== 'error');
  if (mine.length === 0) return bag;
  return {
    ...bag,
    items: bag.items.map((item) => {
      const own = mine.filter((m) => m.itemId === item.id);
      const sold = own.filter((m) => m.kind === 'sold').reduce((s, m) => s + m.quantity, 0);
      const returned = own.filter((m) => m.kind === 'returned').reduce((s, m) => s + m.quantity, 0);
      return { ...item, sold: round3(item.sold + sold), returned: round3(item.returned + returned), pending: round3(Math.max(0, item.pending - sold - returned)) };
    }),
  };
}

export const pendingTotal = (bag: Bag) => round3(bag.items.reduce((s, i) => s + i.pending, 0));

/** Valor das peças vendidas, só para a tela; o total que vale é o do servidor. */
export const soldCents = (bag: Bag) => bag.items.reduce((s, i) => s + Math.round(i.unitPriceCents * i.sold), 0);

/** Quantidade aceita para a baixa: positiva, até 3 casas e no máximo o que ainda está com o vendedor. */
export const validMoveQuantity = (item: BagItem, quantity: number) => quantity > 0 && quantity <= item.pending && round3(quantity) === quantity;

/** Pode finalizar: tudo baixado e nada esperando para subir (o total só fecha depois que o servidor recebeu tudo). */
export const canFinalize = (bag: Bag, moves: BagMove[]) => pendingTotal(bag) === 0 && !moves.some((m) => m.conditionalId === bag.id);
