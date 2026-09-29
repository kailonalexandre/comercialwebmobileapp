import { api } from '@/infrastructure/api';
import type { Paged } from '@/shared/hooks/use-paged-list';

export type Product = { id: number; code: number; name: string; sku: string | null; barcode: string | null; salePriceCents: number; isActive: boolean };

export async function fetchProducts(page: number, search: string): Promise<Paged<Product>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { items: [{ id: 1, code: 1, name: 'Camiseta básica', sku: 'CAM-01', barcode: null, salePriceCents: 4_990, isActive: true }], page: 1, pageSize: 20, total: 1 };
  }
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search) query.set('search', search);
  return api.request<Paged<Product>>(`/v1/products?${query.toString()}`);
}

export type ProductDetail = Product & { description: string | null };

export async function fetchProduct(id: number): Promise<ProductDetail> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { id, code: 1, name: 'Camiseta básica', sku: 'CAM-01', barcode: null, salePriceCents: 4_990, isActive: true, description: 'Algodão, modelagem reta.' };
  }
  return api.request<ProductDetail>(`/v1/products/${id}`);
}
