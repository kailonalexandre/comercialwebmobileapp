import { Pressable, View } from 'react-native';

import { STATUS_LABEL } from '@/features/customers/quick-customer-model';
import { estimateCents } from '@/features/presale/draft-model';
import { discardSale, retrySale, syncSales, useSaleQueue } from '@/features/sales/sale-queue';
import { KIND_LABEL, type SaleQueueEntry } from '@/features/sales/sale-queue-model';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { makeStyles } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

const tone = (e: SaleQueueEntry) => (e.status === 'error' ? 'danger' : 'primary');

// Vendas deste aparelho ainda não confirmadas pelo ComercialWeb (aguardando, enviando ou com erro).
export function PendingSales() {
  const styles = useStyles();
  const items = useSaleQueue().filter((e) => e.status !== 'synced');
  if (items.length === 0) return null;
  return (
    <View style={styles.box}>
      {items.map((e) => (
        <View key={e.id} style={styles.row}>
          <View style={styles.flex}>
            <Text variant="label" numberOfLines={1}>
              {KIND_LABEL[e.kind]} · {e.draft.customer?.name ?? 'Consumidor final'}
            </Text>
            <Text variant="caption" color="textMuted">
              {formatCents(e.totalCents ?? estimateCents(e.draft.items, e.draft.saleDiscount))} · {e.draft.items.length} {e.draft.items.length === 1 ? 'item' : 'itens'}
            </Text>
            {e.error && <Text variant="caption" color="danger">{e.error}</Text>}
          </View>
          <StatusPill label={STATUS_LABEL[e.status]} tone={tone(e)} />
          {e.status === 'error' && (
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => { retrySale(e.id); void syncSales(); }}><Text variant="label" color="primary">Tentar de novo</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => discardSale(e.id)}><Text variant="label" color="danger">Descartar</Text></Pressable>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 140 },
  actions: { flexDirection: 'row', gap: spacing.lg, width: '100%' },
}));
