import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { formatLocal } from '@/features/dashboard/dashboard-model';
import { fetchSales, type SaleStatusFilter } from '@/features/sales/sales-api';
import { statusLabel, statusTone, type SaleListItem } from '@/features/sales/sales-model';
import { ListScreen } from '@/features/shell/list-screen';
import { ChipRow } from '@/shared/components/chip-row';
import { Icon } from '@/shared/components/icon';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

const FILTERS: { key: SaleStatusFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'finalizada', label: 'Finalizadas' },
  { key: 'pre_venda', label: 'Pré-vendas' },
  { key: 'devolucao', label: 'Devoluções' },
];

function SaleRow({ sale }: { sale: SaleListItem }) {
  return (
    <ListRow
      title={sale.customerName ?? 'Consumidor final'}
      lines={[]}
      label={`${sale.customerName ?? 'Consumidor final'}, ${formatCents(sale.totalCents)}`}
      onPress={() => router.push({ pathname: '/venda/[id]', params: { id: String(sale.id) } })}
      subtitle={
        <Text variant="monoSmall" color="textMuted">
          {sale.number} · {formatLocal(sale.createdAt).slice(11)}
        </Text>
      }
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
  const { profile } = useSession();
  const [filter, setFilter] = useState<SaleStatusFilter>('all');
  const fetchPage = useCallback((page: number, search: string) => fetchSales(page, search, filter), [filter]);

  return (
    <ListScreen
      // `key`: outro filtro recomeça a lista na página 1.
      key={filter}
      title="Vendas"
      searchPlaceholder="Número ou cliente"
      emptyMessage="Nenhuma venda encontrada."
      fetchPage={fetchPage}
      keyOf={(s) => String(s.id)}
      renderRow={(s) => <SaleRow sale={s} />}
      sectionOf={(s) => formatLocal(s.createdAt).slice(0, 10)}
      filters={<ChipRow options={FILTERS} selected={filter} onSelect={setFilter} />}
      action={
        profile?.permissions.includes('sales.create') ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Nova pré-venda" onPress={() => router.push('/nova-venda')} style={styles.newButton}>
            <Icon name="add" size={18} color={colors.primary} />
            <Text variant="label" color="primary">
              Pré-venda
            </Text>
          </Pressable>
        ) : undefined
      }
      tabScreen
    />
  );
}

const styles = StyleSheet.create({
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  newButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, minHeight: 44, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
});
