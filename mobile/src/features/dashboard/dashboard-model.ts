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

// Meta do mês: da empresa (loja) ou do próprio vendedor. percent sem teto (pode passar de 100).
export type SalesGoal = { scope: 'company' | 'seller'; goalCents: number; soldCents: number; percent: number };

// Cada bloco vem null quando o usuário não tem a permissão do card na web. `view` é decidida pela API: "store" para quem
// vê o financeiro da loja (contas a receber), "seller" para os demais.
export type Dashboard = {
  salesToday: CountAndTotal | null;
  receivables: CountAndTotal | null;
  lowStockCount: number | null;
  openConditionals: CountAndTotal | null;
  recentSales: RecentSale[] | null;
  view?: 'store' | 'seller';
  salesGoal?: SalesGoal | null;
};

// Indicador "Meta": percentual atingido e a barra (0 a 1). Sem meta cadastrada não inventa número.
export function goalSummary(goal: SalesGoal | null | undefined): { value: string; caption: string; progress: number | null } {
  if (!goal || goal.goalCents <= 0) return { value: '—', caption: 'Sem meta definida', progress: null };
  return {
    value: `${goal.percent}%`,
    caption: `${formatCents(goal.soldCents)} de ${formatCents(goal.goalCents)}`,
    progress: Math.min(1, Math.max(0, goal.soldCents / goal.goalCents)),
  };
}

// "2026-09-10T22:00:00" -> "10/09/2026 22:00". Sem parse de Date: o horário já é o local da empresa.
export function formatLocal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}
