export type QuickProductInput = { name: string; sku: string; barcode: string; saleCents: string; costCents: string };
export type QuickProductErrors = Partial<Record<keyof QuickProductInput, string>>;

export const emptyProduct = (): QuickProductInput => ({ name: '', sku: '', barcode: '', saleCents: '', costCents: '' });

// Campo de preço digita só dígitos e eles viram centavos ("1990" = R$ 19,90); vazio = sem valor.
export const centsFromDigits = (s: string): number | null => {
  const d = s.replace(/\D/g, '').slice(0, 11);
  return d === '' ? null : Number(d);
};

export function validateProduct(i: QuickProductInput): QuickProductErrors {
  const errors: QuickProductErrors = {};
  if (!i.name.trim()) errors.name = 'Informe o nome.';
  if (centsFromDigits(i.saleCents) === null) errors.saleCents = 'Informe o preço de venda.';
  return errors;
}

// Preço e custo em centavos; o ComercialWeb valida SKU/código de barras únicos e calcula o resto.
export function toProductRequest(i: QuickProductInput) {
  const clean = (s: string) => s.trim() || undefined;
  return { name: i.name.trim(), sku: clean(i.sku), barcode: clean(i.barcode), salePriceCents: centsFromDigits(i.saleCents), costPriceCents: centsFromDigits(i.costCents) ?? undefined };
}
