import { api } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';
import type { Paged } from '@/shared/hooks/use-paged-list';

export type OrderChannel = 'store' | 'mercadolivre';

export type Order = {
  id: string;
  number: string;
  customer: string;
  totalCents: number;
  status: string;
  payment: string | null;
  delivery: string | null;
  requiresAttention: boolean;
  createdAt: string;
  updatedAt: string;
};

type Section = {
  channel: string;
  // Preenchido quando a fonte externa (ex.: marketplace) estava fora do ar.
  failure: string | null;
  meta: { page: number; perPage: number; total: number; lastPage: number } | null;
  items: Order[];
};

/** Pega a seção do canal escolhido. Fonte fora do ar vira erro (a lista mostra "tentar de novo"). */
export function pageFromSections(sections: Section[], channel: OrderChannel): Paged<Order> {
  const section = sections.find((s) => s.channel === channel);
  if (!section) return { items: [], page: 1, pageSize: 1, total: 0 };
  if (section.failure) throw new ApiError('server');
  return { items: section.items, page: section.meta?.page ?? 1, pageSize: section.meta?.perPage ?? 1, total: section.meta?.total ?? 0 };
}

const devOrder: Order = {
  id: '1',
  number: 'LV-1',
  customer: 'Maria Souza',
  totalCents: 15_990,
  status: 'Pago',
  payment: 'Pix',
  delivery: 'Correios',
  requiresAttention: false,
  createdAt: '2026-09-29T10:00:00-03:00',
  updatedAt: '2026-09-29T10:05:00-03:00',
};

export async function fetchOrders(channel: OrderChannel, page: number, search: string): Promise<Paged<Order>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { items: [devOrder], page: 1, pageSize: 20, total: 1 };
  }
  const query = new URLSearchParams({ source: channel, page: String(page), pageSize: '20' });
  if (search) query.set('search', search);
  const { sections } = await api.request<{ sections: Section[] }>(`/v1/orders?${query.toString()}`);
  return pageFromSections(sections, channel);
}

export type MarketplaceOrder = {
  id: number;
  channel: string;
  externalOrderId: string | null;
  status: string;
  externalStatus: string | null;
  totalCents: number;
  buyerName: string | null;
  placedAt: string | null;
  items: { title: string; sellerSku: string | null; productId: number | null; quantity: number; unitPriceCents: number }[];
};

export async function fetchMarketplaceOrder(id: number): Promise<MarketplaceOrder> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return {
      id,
      channel: 'mercadolivre',
      externalOrderId: '2000001',
      status: 'Pago',
      externalStatus: 'paid',
      totalCents: 9_990,
      buyerName: 'João Lima',
      placedAt: '2026-09-29T09:00:00-03:00',
      items: [{ title: 'Camiseta básica', sellerSku: 'CAM-01', productId: 1, quantity: 2, unitPriceCents: 4_995 }],
    };
  }
  return api.request<MarketplaceOrder>(`/v1/orders/marketplace/${id}`);
}
