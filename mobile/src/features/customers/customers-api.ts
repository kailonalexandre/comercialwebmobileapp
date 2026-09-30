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

export type CustomerDetail = {
  id: number;
  code: number;
  name: string;
  tradeName: string | null;
  personKind: string;
  document: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  mainAddress: { street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zip: string | null };
  isActive: boolean;
  restrictionAlert: boolean;
  restrictionBlock: boolean;
};

export async function fetchCustomer(id: number): Promise<CustomerDetail> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return {
      id, code: 1, name: 'Mercado Bom Preço', tradeName: null, personKind: 'company', document: null, phone: '(11) 3333-4444', mobile: null, whatsapp: null, email: null,
      mainAddress: { street: null, number: null, district: null, city: 'Campinas', state: 'SP', zip: null }, isActive: true, restrictionAlert: false, restrictionBlock: false,
    };
  }
  return api.request<CustomerDetail>(`/v1/customers/${id}`);
}

// "RUA A, 10 - CENTRO, SAO PAULO/SP - 01001000"; partes ausentes somem.
export function formatAddress(a: CustomerDetail['mainAddress']): string | null {
  const street = [a.street, a.number].filter(Boolean).join(', ');
  const place = [a.city, a.state].filter(Boolean).join('/');
  const parts = [street, a.district, place, a.zip].filter((v) => !!v);
  return parts.length > 0 ? parts.join(' - ') : null;
}
