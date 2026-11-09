import type { Product } from '@/features/catalog/products-api';
import type { Paged } from '@/shared/hooks/use-paged-list';

const plain = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mesma busca da tela, feita no aparelho: nome sem acento, ou código, SKU e código de barras.
export function searchProducts(all: Product[], search: string, page: number, pageSize: number): Paged<Product> {
  const text = plain(search.trim());
  const hits = text === '' ? all : all.filter((p) => plain(p.name).includes(text) || String(p.code) === text || plain(p.sku).includes(text) || plain(p.barcode) === text);
  return { items: hits.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: hits.length };
}
