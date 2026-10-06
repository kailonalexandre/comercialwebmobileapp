import { router } from 'expo-router';
import { View } from 'react-native';

import { fetchPurchases } from '@/features/management/management-api';
import { formatDate, type Purchase } from '@/features/management/management-model';
import { ListScreen } from '@/features/shell/list-screen';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

function PurchaseRow({ purchase: p }: { purchase: Purchase }) {
  return (
    <ListRow
      title={p.number}
      lines={[p.supplierName ?? 'Sem fornecedor', formatDate(p.orderedAt)]}
      label={`${p.number}, ${p.supplierName ?? 'sem fornecedor'}, ${formatCents(p.totalCents)}, ${p.status}`}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
          <Text variant="label">{formatCents(p.totalCents)}</Text>
          <StatusPill label={p.isUrgent ? 'Urgente' : p.status} tone={p.isUrgent ? 'danger' : 'info'} />
        </View>
      }
    />
  );
}

// Compras e entradas: consulta dos pedidos de compra (lançamento e conferência de XML continuam no ComercialWeb).
export function PurchasesScreen() {
  return (
    <ListScreen
      title="Compras e Entradas"
      searchPlaceholder="Número ou fornecedor"
      emptyMessage="Nenhum pedido de compra encontrado."
      fetchPage={fetchPurchases}
      keyOf={(p) => String(p.id)}
      renderRow={(p) => <PurchaseRow purchase={p} />}
      onBack={() => router.back()}
    />
  );
}
