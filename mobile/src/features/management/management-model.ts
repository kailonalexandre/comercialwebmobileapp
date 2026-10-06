import { formatLocal } from '@/features/dashboard/dashboard-model';
import type { Tone } from '@/shared/theme/tokens';

export type TitleKind = 'receivable' | 'payable';
export type TitleStatusFilter = 'all' | 'open' | 'overdue' | 'paid';

export type Title = {
  id: number;
  description: string | null;
  document: string | null;
  personName: string | null;
  dueDate: string; // "2026-09-09T00:00:00": data local da empresa
  amountCents: number;
  paidCents: number;
  openCents: number;
  status: string;
  overdue: boolean;
  installmentNumber: number;
  installmentCount: number;
};

export const TITLE_PATH: Record<TitleKind, string> = { receivable: 'receivables', payable: 'payables' };
export const TITLE_NAME: Record<TitleKind, string> = { receivable: 'Contas a receber', payable: 'Contas a pagar' };

// "2026-09-09T00:00:00" -> "09/09/2026" (sem Date: já é a data da empresa).
export const formatDate = (iso: string) => formatLocal(iso).slice(0, 10);

export function titleStatus(t: Pick<Title, 'status' | 'overdue'>): { label: string; tone: Tone } {
  if (t.status === 'paid') return { label: 'Pago', tone: 'success' };
  if (t.overdue) return { label: 'Vencido', tone: 'danger' };
  return { label: 'Em aberto', tone: 'primary' };
}

export const installmentLabel = (t: Pick<Title, 'installmentNumber' | 'installmentCount'>) =>
  t.installmentCount > 1 ? `Parcela ${t.installmentNumber}/${t.installmentCount}` : null;

export type Totals = { count: number; totalCents: number };
export type FinancialSummary = { receivablesOpen: Totals | null; receivablesOverdue: Totals | null; payablesOpen: Totals | null; payablesOverdue: Totals | null };

export type Purchase = { id: number; number: string; kind: string; status: string; supplierName: string | null; orderedAt: string; totalCents: number; isUrgent: boolean };

export type SalesReport = {
  from: string;
  to: string;
  count: number;
  totalCents: number;
  averageTicketCents: number;
  byDay: { day: string; count: number; totalCents: number }[];
  byMethod: { method: string; count: number; totalCents: number }[];
};

const METHODS: Record<string, string> = { cash: 'Dinheiro', pix_transfer: 'Pix', debit_card: 'Cartão de débito', credit_card: 'Cartão de crédito', store_credit: 'Crédito', crediario: 'Crediário', boleto: 'Boleto', check: 'Cheque' };
// Forma desconhecida (nova no servidor) aparece como veio.
export const methodLabel = (m: string) => METHODS[m] ?? m;

// Período "últimos N dias" terminando hoje: só `from` vai à API (o servidor usa o "hoje" da empresa como fim).
export function periodStart(days: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
