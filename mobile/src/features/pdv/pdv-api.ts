import { File, Paths } from 'expo-file-system';

import { toRequest, toSaleRequest, type Draft } from '@/features/presale/draft-model';
import type { SendResult } from '@/features/presale/presale-api';
import { api } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';

export type PaymentMethod = { code: string; name: string };

export type Quote = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  items: { productId: number; name: string; quantity: number; unitPriceCents: number; totalCents: number; discountCents?: number }[];
};

const devMethods: PaymentMethod[] = [
  { code: 'cash', name: 'Dinheiro' },
  { code: 'pix_transfer', name: 'Pix' },
  { code: 'debit_card', name: 'Cartão de débito' },
];

// Última lista conhecida: sem conexão o operador ainda escolhe a forma de pagamento (o servidor confere ao sincronizar).
const methodsFile = () => new File(Paths.document, 'payment-methods.json');

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  if (!api) return devMethods;
  try {
    const methods = (await api.request<{ methods: PaymentMethod[] }>('/v1/pdv/payment-methods')).methods;
    try {
      methodsFile().create({ overwrite: true });
      methodsFile().write(JSON.stringify(methods));
    } catch {
      // sem cache, só perde o uso offline
    }
    return methods;
  } catch (e) {
    try {
      if (methodsFile().exists) return JSON.parse(await methodsFile().text()) as PaymentMethod[];
    } catch {
      // cache ilegível: segue o erro original
    }
    throw e;
  }
}

// Preços e total reais do ComercialWeb; o total mostrado ao operador é sempre este, nunca o estimado no app.
export async function fetchQuote(request: ReturnType<typeof toRequest>): Promise<Quote> {
  if (!api) {
    // Sem API (só em desenvolvimento): preço fictício fixo, para validar a tela.
    const items = request.items.map((i) => ({ productId: i.productId, name: `Produto ${i.productId}`, quantity: i.quantity, unitPriceCents: 5000, totalCents: 5000 * i.quantity }));
    const total = items.reduce((sum, i) => sum + i.totalCents, 0);
    return { subtotalCents: total, discountCents: 0, totalCents: total, items };
  }
  return api.request<Quote>('/v1/pdv/quote', { method: 'POST', body: request });
}

/**
 * Finaliza a venda com pagamento. `key` é gerada uma vez por venda e reutilizada em toda retentativa:
 * o servidor a usa como client_sale_uuid e responde "já existia" em vez de duplicar (nem estoque, nem caixa).
 */
export async function sendPdvSale(draft: Draft, key: string): Promise<SendResult> {
  try {
    if (!api) {
      const total = draft.items.reduce((s, i) => s + Math.round(i.unitPriceCents * i.quantity), 0);
      const paid = draft.payments.reduce((s, p) => s + p.amountCents, 0);
      return { kind: 'ok', sale: { saleId: 1, number: 'V000999', status: 'finalizada', totalCents: total, changeCents: Math.max(0, paid - total), alreadyExisted: false } };
    }
    const sale = await api.request<NonNullable<Extract<SendResult, { kind: 'ok' }>['sale']>>('/v1/pdv/sales', {
      method: 'POST',
      body: toSaleRequest(draft),
      idempotencyKey: key,
    });
    return { kind: 'ok', sale };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.kind === 'validation') {
        return { kind: 'rejected', message: e.refusal?.message ?? 'Confira os dados da venda e tente de novo.', code: e.refusal?.code, totalCents: e.refusal?.totalCents };
      }
      if (e.kind === 'forbidden') return { kind: 'forbidden' };
    }
    return { kind: 'uncertain' };
  }
}
