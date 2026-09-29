import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { fetchSales } from '@/features/sales/sales-api';
import { statusLabel, statusTone, type SaleListItem } from '@/features/sales/sales-model';
import { formatLocal } from '@/features/dashboard/dashboard-model';
import { AppHeader } from '@/features/shell/app-header';
import { ListScreen } from '@/features/shell/list-screen';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

function SaleRow({ sale }: { sale: SaleListItem }) {
  return (
    <ListRow
      title={`${sale.number} · ${sale.customerName ?? 'Consumidor final'}`}
      lines={[formatLocal(sale.createdAt), ...(sale.sellerName ? [`Vendedor: ${sale.sellerName}`] : [])]}
      onPress={() => router.push({ pathname: '/venda/[id]', params: { id: String(sale.id) } })}
      trailing={
        <View style={styles.trailing}>
          <Text variant="label">{formatCents(sale.totalCents)}</Text>
          <StatusPill label={statusLabel(sale.status)} tone={statusTone(sale.status)} />
        </View>
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
      tabScreen
    />
  );
}

const styles = StyleSheet.create({ trailing: { alignItems: 'flex-end', gap: spacing.xs } });
