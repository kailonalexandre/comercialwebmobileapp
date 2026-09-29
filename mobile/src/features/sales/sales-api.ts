import type { SaleDetail, SaleListItem } from '@/features/sales/sales-model';
import { api } from '@/infrastructure/api';
import type { Paged } from '@/shared/hooks/use-paged-list';

const PAGE_SIZE = 20;

const devSale: SaleListItem = {
  id: 24,
  number: 'V000024',
  createdAt: '2026-09-01T18:23:00',
  status: 'finalizada',
  totalCents: 12_000,
  customerName: null,
  sellerName: 'Administrador',
};

export async function fetchSales(page: number, search: string): Promise<Paged<SaleListItem>> {
  if (!api) return devPage([devSale]);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) query.set('search', search);
  return api.request<Paged<SaleListItem>>(`/v1/sales?${query.toString()}`);
}

export async function fetchSale(id: number): Promise<SaleDetail> {
  if (!api) {
    return { ...devSale, subtotalCents: 12_000, itemDiscountCents: 0, discountCents: 0, freightCents: 0, surchargeCents: 0, observation: null, items: [], payments: [] };
  }
  return api.request<SaleDetail>(`/v1/sales/${id}`);
}

// Sem API configurada, só em desenvolvimento (a sessão fictícia também só existe lá).
function devPage<T>(items: T[]): Paged<T> {
  if (!__DEV__) throw new Error('API não configurada.');
  return { items, page: 1, pageSize: PAGE_SIZE, total: items.length };
}
