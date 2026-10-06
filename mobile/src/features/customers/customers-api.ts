import { searchOffline } from '@/features/customers/customer-cache';
import { toRequest, type QuickCustomerInput } from '@/features/customers/quick-customer-model';
import { api } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';
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
  registrationIncomplete?: boolean;
  tradeScope?: string | null;
};

// Sem conexão a lista vem da cópia local (customer-cache); outros erros seguem para a tela.
export async function fetchCustomers(page: number, search: string): Promise<Paged<Customer>> {
  try {
    return await fetchCustomersRemote(page, search, 20);
  } catch (e) {
    if (e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout')) {
      const local = await searchOffline(search, page, 20);
      if (local) return local;
    }
    throw e;
  }
}

export async function fetchCustomersRemote(page: number, search: string, pageSize: number): Promise<Paged<Customer>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    const c: Customer = { id: 1, code: 1, name: 'Mercado Bom Preço', tradeName: null, document: null, phone: '(11) 99999-0000', city: 'São Paulo', state: 'SP', isActive: true, restrictionAlert: false, restrictionBlock: false };
    return { items: [c], page: 1, pageSize: 20, total: 1 };
  }
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
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

// --- Cadastro rápido -------------------------------------------------------------------------------------------
// Respostas do cadastro/consultas chegam como o ComercialWeb as devolve (snake_case, dentro de `data`).

export type CreatedCustomer = { id: number; incomplete: boolean };

export async function createQuickCustomer(input: QuickCustomerInput, idempotencyKey: string): Promise<CreatedCustomer> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { id: 1, incomplete: !input.document };
  }
  const res = await api.request<{ data: { id: number; registration_incomplete: boolean } }>('/v1/customers', {
    method: 'POST', body: toRequest(input), idempotencyKey, timeoutMs: 15_000,
  });
  return { id: res.data.id, incomplete: res.data.registration_incomplete };
}

export type DuplicateMatch = { id: number; name: string; document: string | null; phone: string | null; email: string | null; reasons: string[] };

// Falha na checagem nunca bloqueia o cadastro: sem rede, a duplicidade fica para o ComercialWeb.
export async function findDuplicates(query: { document?: string; phone?: string; email?: string }): Promise<DuplicateMatch[]> {
  if (!api) return [];
  try {
    const res = await api.request<{ data: { matches: DuplicateMatch[] } }>('/v1/customers/duplicates', { method: 'POST', body: query, timeoutMs: 6_000 });
    return res.data.matches;
  } catch {
    return [];
  }
}

export type PostalCodeData = { street: string | null; district: string | null; city: string | null; state: string | null };

export async function lookupPostalCode(zip: string): Promise<PostalCodeData | null> {
  if (!api) return null;
  try {
    const res = await api.request<{ data: PostalCodeData | null }>(`/v1/customers/lookup/postal-code?zip=${encodeURIComponent(zip)}`, { timeoutMs: 8_000 });
    return res.data;
  } catch {
    return null;
  }
}

export type CompanyData = { name: string | null; trade_name: string | null; phone: string | null; email: string | null };

export async function lookupCompany(document: string): Promise<CompanyData | null> {
  if (!api) return null;
  try {
    const res = await api.request<{ data: CompanyData | null }>(`/v1/customers/lookup/company?document=${encodeURIComponent(document)}`, { timeoutMs: 10_000 });
    return res.data;
  } catch {
    return null;
  }
}
