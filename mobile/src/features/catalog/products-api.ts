import { toProductRequest, type QuickProductInput } from '@/features/catalog/quick-product-model';
import { pricesOffline, searchProductsOffline } from '@/features/catalog/product-cache';
import { DEFAULT_TABLE } from '@/features/pricing/price-table-model';
import { api } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';
import type { Paged } from '@/shared/hooks/use-paged-list';

// salePriceCents = preço do cadastro (varejo). priceCents = preço na tabela pedida (null = produto sem preço nela).
export type Product = { id: number; code: number; name: string; sku: string | null; barcode: string | null; salePriceCents: number; isActive: boolean; priceCents: number | null };

// Sem conexão a lista vem da cópia local (product-cache); outros erros seguem para a tela.
export async function fetchProducts(page: number, search: string, priceTable: string = DEFAULT_TABLE): Promise<Paged<Product>> {
  try {
    return await fetchProductsRemote(page, search, priceTable, 20);
  } catch (e) {
    if (e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout')) {
      const local = await searchProductsOffline(priceTable, search, page, 20);
      if (local) return local;
    }
    throw e;
  }
}

export async function fetchProductsRemote(page: number, search: string, priceTable: string, pageSize: number): Promise<Paged<Product>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { items: [{ id: 1, code: 1, name: 'Camiseta básica', sku: 'CAM-01', barcode: null, salePriceCents: 4_990, isActive: true, priceCents: priceTable === 'atacado' ? 3_990 : 4_990 }], page: 1, pageSize: 20, total: 1 };
  }
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) query.set('search', search);
  query.set('priceTable', priceTable);
  return api.request<Paged<Product>>(`/v1/products?${query.toString()}`);
}

export type ProductStock = { productId: number; unitId: number | null; totalMilli: number };

// Saldo da unidade do aparelho, calculado pelo ComercialWeb. Falha (sem permissão, servidor fora) é tratada pela tela.
export async function fetchProductStock(id: number): Promise<ProductStock> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { productId: id, unitId: 1, totalMilli: 12_500 };
  }
  return api.request<ProductStock>(`/v1/products/${id}/stock`);
}

// prices = preço em cada tabela, como o ComercialWeb calcula (ausente quando ele não respondeu).
export type ProductDetail = Product & { description: string | null; prices?: Record<string, number> };

export async function fetchProduct(id: number): Promise<ProductDetail> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { id, code: 1, name: 'Camiseta básica', sku: 'CAM-01', barcode: null, salePriceCents: 4_990, isActive: true, priceCents: 4_990, description: 'Algodão, modelagem reta.', prices: { varejo: 4_990, atacado: 3_990 } };
  }
  return api.request<ProductDetail>(`/v1/products/${id}`);
}

// Preços do carrinho numa tabela, calculados pelo ComercialWeb (null = produto sem preço nela).
export async function fetchPricesIn(productIds: number[], priceTable: string): Promise<Record<string, number | null>> {
  if (!api) return Object.fromEntries(productIds.map((id) => [String(id), priceTable === 'atacado' ? 3_990 : 4_990]));
  try {
    return (await api.request<{ prices: Record<string, number | null> }>('/v1/products/prices', { method: 'POST', body: { productIds, priceTable } })).prices;
  } catch (e) {
    // Sem conexão: preços da última cópia local (o ComercialWeb recalcula ao sincronizar a venda).
    if (e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout')) {
      const local = await pricesOffline(priceTable, productIds);
      if (local) return local;
    }
    throw e;
  }
}

// Cadastro rápido: o ComercialWeb aplica as regras de Produto e deduplica pela Idempotency-Key.
export async function createQuickProduct(input: QuickProductInput, idempotencyKey: string): Promise<{ id: number }> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { id: 1 };
  }
  const res = await api.request<{ data: { id: number } }>('/v1/products', {
    method: 'POST', body: toProductRequest(input), idempotencyKey, timeoutMs: 15_000,
  });
  return { id: res.data.id };
}
