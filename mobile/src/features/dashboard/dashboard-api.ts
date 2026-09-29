import type { Dashboard } from '@/features/dashboard/dashboard-model';
import { api } from '@/infrastructure/api';

// Sem API configurada: dados fictícios apenas em desenvolvimento, para validar layout.
const devDashboard: Dashboard = {
  salesToday: { count: 0, totalCents: 0 },
  receivables: { count: 5, totalCents: 48_467 },
  lowStockCount: 1,
  openConditionals: { count: 1, totalCents: 48_000 },
  recentSales: [
    { id: 24, number: 'V000024', customerName: null, totalCents: 12_000, occurredAt: '2026-09-01T18:23:00', status: 'finalizada' },
    { id: 19, number: 'V000019', customerName: 'Mercado Bom Preço', totalCents: 189_900, occurredAt: '2026-09-01T15:47:00', status: 'finalizada' },
  ],
};

export async function fetchDashboard(): Promise<Dashboard> {
  if (api) return api.request<Dashboard>('/v1/dashboard');
  if (__DEV__) return devDashboard;
  throw new Error('API não configurada.');
}
