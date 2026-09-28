import type { IconName } from '@/shared/components/icon';
import type { Tone } from '@/shared/theme/tokens';

// Dados fictícios para validar layout antes da integração com a API.
export type Kpi = { id: string; label: string; icon: IconName; tone: Tone; value: string; detail: string };

export const dashboardMock = {
  userName: 'Administrador',
  company: 'Empresa Demonstração',
  unreadNotifications: 4,
  kpis: [
    { id: 'sales', label: 'Vendas hoje', icon: 'bag-handle-outline', tone: 'primary', value: 'R$ 0,00', detail: '0 vendas finalizadas' },
    { id: 'receivable', label: 'Contas a receber', icon: 'cash-outline', tone: 'success', value: 'R$ 484,67', detail: '5 títulos em aberto' },
    { id: 'low-stock', label: 'Estoque baixo', icon: 'warning-outline', tone: 'danger', value: '1', detail: '1 item precisa de reposição' },
    { id: 'consignment', label: 'Condicionais em aberto', icon: 'document-text-outline', tone: 'primary', value: '1', detail: 'R$ 480,00 em mercadoria' },
  ] satisfies Kpi[],
  recentSales: [
    { id: 'V000024', customer: 'Consumidor final', date: '01/09/2026 18:23', cents: 12_000 },
    { id: 'V000021', customer: 'Consumidor final', date: '01/09/2026 18:22', cents: 12_000 },
    { id: 'V000019', customer: 'Mercado Bom Preço', date: '01/09/2026 15:47', cents: 189_900 },
  ],
};
