import { router } from 'expo-router';

import { fetchSales } from '@/features/sales/sales-api';
import { statusLabel, statusTone, type SaleListItem } from '@/features/sales/sales-model';
import { formatLocal } from '@/features/dashboard/dashboard-model';
import { AppHeader } from '@/features/shell/app-header';
import { ListScreen } from '@/features/shell/list-screen';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { formatCents } from '@/shared/utils/format';

function SaleRow({ sale }: { sale: SaleListItem }) {
  return (
    <ListRow
      title={`${sale.number} · ${sale.customerName ?? 'Consumidor final'}`}
      lines={[formatLocal(sale.createdAt), ...(sale.sellerName ? [`Vendedor: ${sale.sellerName}`] : [])]}
      onPress={() => router.push({ pathname: '/venda/[id]', params: { id: String(sale.id) } })}
      trailing={
        <>
          <StatusPill label={statusLabel(sale.status)} tone={statusTone(sale.status)} />
          <Text variant="label">{formatCents(sale.totalCents)}</Text>
        </>
      }
    />
  );
}

export function SalesScreen() {
  return (
    <ListScreen
      title="Vendas"
      subtitle="Consulta de vendas da unidade."
      searchPlaceholder="Buscar por número ou cliente"
      emptyMessage="Nenhuma venda encontrada."
      fetchPage={fetchSales}
      keyOf={(s) => String(s.id)}
      renderRow={(s) => <SaleRow sale={s} />}
      header={<AppHeader />}
    />
  );
}
