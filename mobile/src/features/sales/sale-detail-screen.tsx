import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatLocal } from '@/features/dashboard/dashboard-model';
import { fetchSale } from '@/features/sales/sales-api';
import { formatQuantity, statusLabel, statusTone } from '@/features/sales/sales-model';
import { ReceiptActions } from '@/features/sales/receipt-actions';
import { DetailFrame } from '@/features/shell/detail-frame';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text variant={strong ? 'label' : 'body'} color={strong ? 'text' : 'textMuted'}>
        {label}
      </Text>
      <Text variant={strong ? 'label' : 'body'}>{value}</Text>
    </View>
  );
}

export function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetcher = useCallback(() => fetchSale(Number(id)), [id]);
  const { data: sale, failure, error, reload } = useDetail(fetcher);

  return (
    <DetailFrame title="Venda" loading={!sale && !failure} failure={failure} error={error} notFoundMessage="Venda não encontrada." onRetry={reload}>
      {sale && (
        <>
          <View style={styles.card}>
            <View style={styles.between}>
              <Text variant="title">{sale.number}</Text>
              <StatusPill label={statusLabel(sale.status)} tone={statusTone(sale.status)} />
            </View>
            <Text color="textMuted">{formatLocal(sale.createdAt)}</Text>
            <Text>{sale.customerName ?? 'Consumidor final'}</Text>
            {sale.sellerName && <Text color="textMuted">Vendedor: {sale.sellerName}</Text>}
          </View>

          <Text variant="heading">Itens</Text>
          <View style={styles.card}>
            {sale.items.length === 0 && <Text color="textMuted">Sem itens.</Text>}
            {sale.items.map((item, i) => (
              <View key={`${i}-${item.description}`} style={[styles.item, i > 0 && styles.divider]}>
                <View style={styles.flex}>
                  <Text variant="label">{item.description}</Text>
                  <Text variant="caption" color="textMuted">
                    {formatQuantity(item.quantity)} × {formatCents(item.unitPriceCents)}
                    {item.discountCents > 0 ? ` · desconto ${formatCents(item.discountCents)}` : ''}
                  </Text>
                </View>
                <Text variant="label">{formatCents(item.totalCents)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Line label="Subtotal" value={formatCents(sale.subtotalCents)} />
            {sale.itemDiscountCents + sale.discountCents > 0 && (
              <Line label="Descontos" value={`- ${formatCents(sale.itemDiscountCents + sale.discountCents)}`} />
            )}
            {sale.freightCents > 0 && <Line label="Frete" value={formatCents(sale.freightCents)} />}
            {sale.surchargeCents > 0 && <Line label="Acréscimo" value={formatCents(sale.surchargeCents)} />}
            <Line label="Total" value={formatCents(sale.totalCents)} strong />
          </View>

          {sale.payments.length > 0 && (
            <>
              <Text variant="heading">Pagamentos</Text>
              <View style={styles.card}>
                {sale.payments.map((p, i) => (
                  <Line
                    key={`${i}-${p.method}`}
                    label={p.installments && p.installments > 1 ? `${p.method} (${p.installments}x)` : p.method}
                    value={formatCents(p.amountCents)}
                  />
                ))}
              </View>
            </>
          )}

          {sale.observation && (
            <>
              <Text variant="heading">Observação</Text>
              <Text color="textMuted">{sale.observation}</Text>
            </>
          )}

          <Text variant="heading">Comprovante</Text>
          <ReceiptActions saleId={sale.id} />
        </>
      )}
    </DetailFrame>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  flex: { flex: 1 },
});
