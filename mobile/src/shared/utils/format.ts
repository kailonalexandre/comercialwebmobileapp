const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Valores monetários trafegam em centavos (inteiro) para evitar erro de ponto flutuante.
export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

// Normaliza texto para busca: sem acento, minúsculo. Hermes sem ICU completo cai no texto original.
export function normalizeSearch(value: string): string {
  const lower = value.trim().toLowerCase();
  try {
    return lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch {
    return lower;
  }
}
