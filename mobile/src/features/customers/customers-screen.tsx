import { router } from 'expo-router';

import { ListScreen } from '@/features/shell/list-screen';
import { fetchCustomers } from '@/features/customers/customers-api';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';

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
