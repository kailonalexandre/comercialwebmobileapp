// Tabela de preço é decidida e calculada pelo ComercialWeb. O app só guarda qual foi escolhida e mostra o que o servidor devolve.
export const DEFAULT_TABLE = 'varejo';

export type PriceTable = { key: string; label: string };

export const FALLBACK_TABLES: PriceTable[] = [{ key: DEFAULT_TABLE, label: 'Varejo' }];

export const labelOf = (tables: PriceTable[], key: string): string => tables.find((t) => t.key === key)?.label ?? key;

// Escolha guardada que não existe mais na empresa volta para o varejo.
export const validTable = (tables: PriceTable[], key: string | null | undefined): string =>
  key && tables.some((t) => t.key === key) ? key : DEFAULT_TABLE;

// Cadastro de cliente tem só o campo informativo "escopo de comércio" (a web não o usa em venda):
// cliente só de atacado abre a venda em Atacado; qualquer outro caso não sugere nada.
export const suggestedTable = (tradeScope: string | null | undefined, tables: PriceTable[]): string | null =>
  tradeScope === 'wholesale' && tables.some((t) => t.key === 'atacado') ? 'atacado' : null;

// Preços do carrinho numa tabela: produtos sem preço nela impedem a troca (não se inventa valor).
export function applyPrices<T extends { productId: number; unitPriceCents: number; name: string }>(
  items: T[],
  prices: Record<string, number | null>,
): { items: T[]; missing: string[] } {
  const missing = items.filter((i) => prices[String(i.productId)] == null).map((i) => i.name);
  return { items: items.map((i) => ({ ...i, unitPriceCents: prices[String(i.productId)] ?? i.unitPriceCents })), missing };
}
