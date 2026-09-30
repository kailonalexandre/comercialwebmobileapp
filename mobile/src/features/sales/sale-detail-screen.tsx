import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { formatLocal } from '@/features/dashboard/dashboard-model';
import { fetchSale } from '@/features/sales/sales-api';
import { formatQuantity, statusLabel, statusTone } from '@/features/sales/sales-model';
import { ReceiptActions } from '@/features/sales/receipt-actions';
import { DetailFrame } from '@/features/shell/detail-frame';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { radius, shadow, spacing } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const styles = useStyles();
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
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetcher = useCallback(() => fetchSale(Number(id)), [id]);
  const { data: sale, failure, error, reload } = useDetail(fetcher);

  return (
    <DetailFrame title="Venda" loading={!sale && !failure} failure={failure} error={error} notFoundMessage="Venda não encontrada." onRetry={reload}>
      {sale && (
        <>
          <View style={styles.hero}>
            <StatusPill label={statusLabel(sale.status)} tone={statusTone(sale.status)} />
            <Text variant="hero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatCents(sale.totalCents)}</Text>
            <Text variant="mono" color="textMuted">
              {sale.number} · {formatLocal(sale.createdAt)}
            </Text>
          </View>

          <View style={styles.card}>
            <Line label="Cliente" value={sale.customerName ?? 'Consumidor final'} />
            {sale.sellerName && <Line label="Vendedor" value={sale.sellerName} />}
            {sale.payments.length > 0 && <Line label="Pagamento" value={sale.payments.map((p) => p.method).join(', ')} />}
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

const useStyles = makeStyles((colors) => ({
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  flex: { flex: 1 },
}));
