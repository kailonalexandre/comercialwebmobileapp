import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { formatLocal } from '@/features/dashboard/dashboard-model';
import { fetchOrders, type Order, type OrderChannel } from '@/features/orders/orders-api';
import { ListScreen } from '@/features/shell/list-screen';
import { ChipRow } from '@/shared/components/chip-row';
import { ListRow } from '@/shared/components/list-row';
import { StateView } from '@/shared/components/state-view';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

// Cada canal exige a própria permissão da web; o servidor confere de novo em cada rota.
const CHANNELS: { key: OrderChannel; label: string; permission: string }[] = [
  { key: 'store', label: 'Loja Virtual', permission: 'loja-virtual.access' },
  { key: 'mercadolivre', label: 'Mercado Livre', permission: 'marketplaces.view' },
];

function OrderRow({ order, channel }: { order: Order; channel: OrderChannel }) {
  return (
    <ListRow
      title={`${order.number} · ${order.customer}`}
      lines={[formatLocal(order.createdAt), [order.payment, order.delivery].filter(Boolean).join(' · ')].filter(Boolean)}
      // Só pedido de marketplace tem detalhe na API; o da Loja Virtual ainda não.
      onPress={channel === 'mercadolivre' ? () => router.push({ pathname: '/pedido/[id]', params: { id: order.id } }) : undefined}
      trailing={
        <View style={styles.trailing}>
          <Text variant="label">{formatCents(order.totalCents)}</Text>
          <StatusPill label={order.status} tone="primary" />
          {order.requiresAttention && <StatusPill label="Atenção" tone="danger" />}
        </View>
      }
    />
  );
}

function OrdersList({ channel, chips }: { channel: OrderChannel; chips: React.ReactElement }) {
  const fetchPage = useCallback((page: number, search: string) => fetchOrders(channel, page, search), [channel]);
  return (
    <ListScreen
      title="Pedidos"
      subtitle="Loja Virtual e marketplaces."
      searchPlaceholder="Buscar por número ou cliente"
      emptyMessage="Nenhum pedido encontrado."
      fetchPage={fetchPage}
      keyOf={(o) => o.id}
      renderRow={(o) => <OrderRow order={o} channel={channel} />}
      filters={chips}
      tabScreen
    />
  );
}

export function OrdersScreen() {
  const { profile } = useSession();
  const [chosen, setChosen] = useState<OrderChannel | null>(null);

  if (!profile) return <StateView kind="loading" />;
  const available = CHANNELS.filter((c) => profile.permissions.includes(c.permission));
  if (available.length === 0) return <StateView kind="empty" message="Você não tem acesso aos pedidos." />;

  const channel = chosen ?? available[0]!.key;
  // `key`: trocar de canal recomeça a lista na página 1.
  return <OrdersList key={channel} channel={channel} chips={<ChipRow options={available} selected={channel} onSelect={setChosen} />} />;
}

const styles = StyleSheet.create({ trailing: { alignItems: 'flex-end', gap: spacing.xs } });
