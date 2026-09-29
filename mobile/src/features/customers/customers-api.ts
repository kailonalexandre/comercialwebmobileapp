import { api } from '@/infrastructure/api';
import type { Paged } from '@/shared/hooks/use-paged-list';

export type Customer = {
  id: number;
  code: number;
  name: string;
  tradeName: string | null;
  document: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  restrictionAlert: boolean;
  restrictionBlock: boolean;
};

export async function fetchCustomers(page: number, search: string): Promise<Paged<Customer>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    const c: Customer = { id: 1, code: 1, name: 'Mercado Bom Preço', tradeName: null, document: null, phone: '(11) 99999-0000', city: 'São Paulo', state: 'SP', isActive: true, restrictionAlert: false, restrictionBlock: false };
    return { items: [c], page: 1, pageSize: 20, total: 1 };
  }
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search) query.set('search', search);
  return api.request<Paged<Customer>>(`/v1/customers?${query.toString()}`);
}
