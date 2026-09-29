import { router } from 'expo-router';

import { ListScreen } from '@/features/shell/list-screen';
import { api } from '@/infrastructure/api';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import type { Paged } from '@/shared/hooks/use-paged-list';

type Customer = {
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

async function fetchCustomers(page: number, search: string): Promise<Paged<Customer>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    const c: Customer = { id: 1, code: 1, name: 'Mercado Bom Preço', tradeName: null, document: null, phone: '(11) 99999-0000', city: 'São Paulo', state: 'SP', isActive: true, restrictionAlert: false, restrictionBlock: false };
    return { items: [c], page: 1, pageSize: 20, total: 1 };
  }
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search) query.set('search', search);
  return api.request<Paged<Customer>>(`/v1/customers?${query.toString()}`);
}

export function CustomersScreen() {
  return (
    <ListScreen
      title="Clientes"
      searchPlaceholder="Nome, documento ou telefone"
      emptyMessage="Nenhum cliente encontrado."
      fetchPage={fetchCustomers}
      keyOf={(c) => String(c.id)}
      onBack={() => router.back()}
      renderRow={(c) => (
        <ListRow
          title={c.name}
          lines={[c.phone, c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : null].filter((v): v is string => !!v)}
          trailing={
            c.restrictionBlock ? (
              <StatusPill label="Bloqueado" tone="danger" />
            ) : c.restrictionAlert ? (
              <StatusPill label="Restrição" tone="primary" />
            ) : undefined
          }
        />
      )}
    />
  );
}
