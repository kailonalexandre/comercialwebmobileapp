import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatLocal } from '@/features/dashboard/dashboard-model';
import { fetchMarketplaceOrder } from '@/features/orders/orders-api';
import { formatQuantity } from '@/features/sales/sales-model';
import { DetailFrame } from '@/features/shell/detail-frame';
import { InfoCard } from '@/shared/components/info-card';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { colors, fonts, spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

const channelLabel: Record<string, string> = { mercadolivre: 'Mercado Livre' };

export function MarketplaceOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetcher = useCallback(() => fetchMarketplaceOrder(Number(id)), [id]);
  const { data: o, failure, error, reload } = useDetail(fetcher);

  return (
    <DetailFrame title="Pedido" loading={!o && !failure} failure={failure} error={error} notFoundMessage="Pedido não encontrado." onRetry={reload}>
      {o && (
        <>
          <View style={styles.hero}>
            <StatusPill label={o.status} tone="primary" />
            <Text style={styles.heroTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {formatCents(o.totalCents)}
            </Text>
            <Text variant="mono" color="textMuted">
              {o.externalOrderId ?? String(o.id)}
            </Text>
          </View>
          <InfoCard
            rows={[
              { label: 'Canal', value: channelLabel[o.channel] ?? o.channel },
              { label: 'Comprador', value: o.buyerName },
              { label: 'Data do pedido', value: o.placedAt ? formatLocal(o.placedAt) : null },
              { label: 'Situação no canal', value: o.externalStatus },
            ]}
          />
          <Text variant="heading">Itens</Text>
          {o.items.length === 0 && <Text color="textMuted">Sem itens.</Text>}
          {o.items.map((item, i) => (
            <ListRow
              key={`${i}-${item.title}`}
              title={item.title}
              lines={[`${formatQuantity(item.quantity)} × ${formatCents(item.unitPriceCents)}${item.sellerSku ? ` · SKU ${item.sellerSku}` : ''}`]}
              trailing={<Text variant="label">{formatCents(Math.round(item.quantity * item.unitPriceCents))}</Text>}
            />
          ))}
        </>
      )}
    </DetailFrame>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  heroTotal: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: colors.text },
});
