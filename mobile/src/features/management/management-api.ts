import type { FinancialSummary, Purchase, SalesReport, Title, TitleKind, TitleStatusFilter } from '@/features/management/management-model';
import { TITLE_PATH } from '@/features/management/management-model';
import { api } from '@/infrastructure/api';
import type { Paged } from '@/shared/hooks/use-paged-list';

const PAGE_SIZE = 20;

// Sem API configurada: dados fictícios apenas em desenvolvimento, para validar layout.
const devPage = <T,>(items: T[]): Paged<T> => ({ items, page: 1, pageSize: PAGE_SIZE, total: items.length });

export async function fetchFinancialSummary(): Promise<FinancialSummary> {
  if (api) return api.request<FinancialSummary>('/v1/financial/summary');
  if (__DEV__) return { receivablesOpen: { count: 5, totalCents: 48_467 }, receivablesOverdue: { count: 2, totalCents: 12_000 }, payablesOpen: { count: 3, totalCents: 90_000 }, payablesOverdue: { count: 1, totalCents: 30_000 } };
  throw new Error('API não configurada.');
}

export async function fetchTitles(kind: TitleKind, page: number, search: string, status: TitleStatusFilter): Promise<Paged<Title>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return devPage([{ id: 1, description: 'Venda V000024', document: null, personName: 'Mercado Bom Preço', dueDate: '2026-09-09T00:00:00', amountCents: 12_000, paidCents: 2_000, openCents: 10_000, status: 'open', overdue: true, installmentNumber: 1, installmentCount: 3 }]);
  }
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) query.set('search', search);
  if (status !== 'all') query.set('status', status);
  return api.request<Paged<Title>>(`/v1/financial/${TITLE_PATH[kind]}?${query.toString()}`);
}

export async function fetchPurchases(page: number, search: string): Promise<Paged<Purchase>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return devPage([{ id: 1, number: 'PC000001', kind: 'order', status: 'pendente', supplierName: 'Fornecedor X', orderedAt: '2026-09-01T00:00:00', totalCents: 150_000, isUrgent: true }]);
  }
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) query.set('search', search);
  return api.request<Paged<Purchase>>(`/v1/purchases?${query.toString()}`);
}

export async function fetchSalesReport(from: string): Promise<SalesReport> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { from, to: from, count: 2, totalCents: 15_000, averageTicketCents: 7_500, byDay: [{ day: `${from}T00:00:00`, count: 2, totalCents: 15_000 }], byMethod: [{ method: 'cash', count: 1, totalCents: 10_000 }, { method: 'pix_transfer', count: 1, totalCents: 5_000 }] };
  }
  return api.request<SalesReport>(`/v1/reports/sales?from=${from}`);
}
