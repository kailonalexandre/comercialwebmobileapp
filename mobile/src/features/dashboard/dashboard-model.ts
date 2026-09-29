import type { IconName } from '@/shared/components/icon';
import type { Tone } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

type CountAndTotal = { count: number; totalCents: number };

export type RecentSale = {
  id: number;
  number: string | null;
  customerName: string | null;
  totalCents: number;
  occurredAt: string; // horário local da empresa, sem fuso: "2026-09-10T22:00:00"
  status: string;
};

// Cada bloco vem null quando o usuário não tem a permissão do card na web.
export type Dashboard = {
  salesToday: CountAndTotal | null;
  receivables: CountAndTotal | null;
  lowStockCount: number | null;
  openConditionals: CountAndTotal | null;
  recentSales: RecentSale[] | null;
};

export type Kpi = { id: string; label: string; icon: IconName; tone: Tone; value: string; detail: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Só gera cartão para o que o servidor devolveu: sem permissão, o cartão não existe.
export function toKpis(d: Dashboard): Kpi[] {
  const kpis: Kpi[] = [];
  if (d.salesToday) {
    kpis.push({
      id: 'sales',
      label: 'Vendas hoje',
      icon: 'bag-handle-outline',
      tone: 'primary',
      value: formatCents(d.salesToday.totalCents),
      detail: `${plural(d.salesToday.count, 'venda finalizada', 'vendas finalizadas')}`,
    });
  }
  if (d.receivables) {
    kpis.push({
      id: 'receivable',
      label: 'Contas a receber',
      icon: 'cash-outline',
      tone: 'success',
      value: formatCents(d.receivables.totalCents),
      detail: `${plural(d.receivables.count, 'título em aberto', 'títulos em aberto')}`,
    });
  }
  if (d.lowStockCount !== null) {
    kpis.push({
      id: 'low-stock',
      label: 'Estoque baixo',
      icon: 'warning-outline',
      tone: 'danger',
      value: String(d.lowStockCount),
      detail: d.lowStockCount === 0 ? 'Nenhum item para repor' : `${plural(d.lowStockCount, 'item precisa', 'itens precisam')} de reposição`,
    });
  }
  if (d.openConditionals) {
    kpis.push({
      id: 'consignment',
      label: 'Condicionais em aberto',
      icon: 'document-text-outline',
      tone: 'primary',
      value: String(d.openConditionals.count),
      detail: `${formatCents(d.openConditionals.totalCents)} em mercadoria`,
    });
  }
  return kpis;
}

// "2026-09-10T22:00:00" -> "10/09/2026 22:00". Sem parse de Date: o horário já é o local da empresa.
export function formatLocal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}
