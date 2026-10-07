import { formatDate, installmentLabel, methodLabel, periodStart, titleStatus } from '@/features/management/management-model';

describe('management-model', () => {
  it('status do título: baixado/perdido > vencido > parcial/em aberto', () => {
    expect(titleStatus({ status: 'settled', overdue: false }).label).toBe('Baixado');
    expect(titleStatus({ status: 'lost', overdue: false }).label).toBe('Perdido');
    expect(titleStatus({ status: 'partial', overdue: false }).label).toBe('Parcial');
    expect(titleStatus({ status: 'open', overdue: true })).toEqual({ label: 'Vencido', tone: 'danger' });
    expect(titleStatus({ status: 'open', overdue: false }).label).toBe('Em aberto');
  });
  it('parcela só aparece quando há mais de uma', () => {
    expect(installmentLabel({ installmentNumber: 1, installmentCount: 1 })).toBeNull();
    expect(installmentLabel({ installmentNumber: 2, installmentCount: 3 })).toBe('Parcela 2/3');
  });
  it('data da empresa sem fuso', () => {
    expect(formatDate('2026-09-09T00:00:00')).toBe('09/09/2026');
  });
  it('início do período inclui hoje e atravessa mês', () => {
    expect(periodStart(7, new Date(2026, 8, 10))).toBe('2026-09-04');
    expect(periodStart(30, new Date(2026, 8, 10))).toBe('2026-08-12');
  });
  it('forma de pagamento desconhecida aparece como veio', () => {
    expect(methodLabel('pix_transfer')).toBe('Pix');
    expect(methodLabel('nova_forma')).toBe('nova_forma');
  });
});
