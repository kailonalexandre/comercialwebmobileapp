import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatLocal } from '@/features/dashboard/dashboard-model';
import { fetchSale } from '@/features/sales/sales-api';
import { formatQuantity, statusLabel, statusTone, type SaleDetail } from '@/features/sales/sales-model';
import { Icon } from '@/shared/components/icon';
import { StateView } from '@/shared/components/state-view';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

type Load = { sale: SaleDetail | null; failure: 'none' | 'not_found' | 'error' };

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
  const [load, setLoad] = useState<Load>({ sale: null, failure: 'none' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchSale(Number(id))
      .then((sale) => active && setLoad({ sale, failure: 'none' }))
      .catch((e: { kind?: string }) => active && setLoad({ sale: null, failure: e.kind === 'not_found' ? 'not_found' : 'error' }));
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const { sale, failure } = load;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="heading">Venda</Text>
      </View>

      {!sale && failure === 'none' && <StateView kind="loading" />}
      {failure === 'not_found' && <StateView kind="empty" message="Venda não encontrada." />}
      {failure === 'error' && (
        <StateView
          kind="error"
          onRetry={() => {
            setLoad({ sale: null, failure: 'none' });
            setAttempt((n) => n + 1);
          }}
        />
      )}

      {sale && (
        <ScrollView contentContainerStyle={styles.content}>
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
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  flex: { flex: 1 },
});
