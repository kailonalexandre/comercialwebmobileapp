import type { Tone } from '@/shared/theme/tokens';

export type SaleListItem = {
  id: number;
  number: string;
  createdAt: string; // horário local da empresa, sem fuso
  status: string;
  totalCents: number;
  customerName: string | null;
  sellerName: string | null;
};

export type SaleItem = {
  description: string;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
};

export type SalePayment = { method: string; amountCents: number; installments: number | null };

export type SaleDetail = SaleListItem & {
  subtotalCents: number;
  itemDiscountCents: number;
  discountCents: number;
  freightCents: number;
  surchargeCents: number;
  observation: string | null;
  items: SaleItem[];
  payments: SalePayment[];
};

const labels: Record<string, string> = {
  pendente: 'Pendente',
  pre_venda: 'Pré-venda',
  finalizada: 'Finalizada',
  devolucao: 'Devolução',
  troca: 'Troca',
  condicional_aberto: 'Condicional aberto',
  condicional_fechado: 'Condicional fechado',
  condicional_cancelado: 'Condicional cancelado',
};

// Status desconhecido (campo novo no servidor) aparece como veio, nunca quebra a tela.
export const statusLabel = (status: string) => labels[status] ?? status;

export function statusTone(status: string): Tone {
  if (status === 'finalizada') return 'success';
  if (status === 'pre_venda') return 'info';
  if (status === 'condicional_cancelado' || status === 'devolucao' || status === 'troca') return 'danger';
  return 'primary';
}

// Quantidade pode ser fracionada (kg, m): sem zeros à direita.
export const formatQuantity = (q: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(q);
