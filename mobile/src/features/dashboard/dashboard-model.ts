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

// "2026-09-10T22:00:00" -> "10/09/2026 22:00". Sem parse de Date: o horário já é o local da empresa.
export function formatLocal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}
