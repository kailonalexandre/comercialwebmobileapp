import { Pressable, View } from 'react-native';

import { discardEntry, inActiveBusiness, retryEntry, syncQuickCustomers, useQuickCustomerQueue } from '@/features/customers/quick-customer-queue';
import { STATUS_LABEL, type QueueEntry } from '@/features/customers/quick-customer-model';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { makeStyles } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';

const tone = (e: QueueEntry) => (e.status === 'error' ? 'danger' : e.status === 'synced' ? 'success' : 'primary');

// Cadastros rápidos feitos neste aparelho que ainda não foram confirmados (ou acabaram de ser).
export function PendingCustomers() {
  const styles = useStyles();
  const items = useQuickCustomerQueue().filter((e) => e.status !== 'synced' && inActiveBusiness(e));
  if (items.length === 0) return null;
  return (
    <View style={styles.box}>
      {items.map((e) => (
        <View key={e.id} style={styles.row}>
          <View style={styles.flex}>
            <Text variant="label" numberOfLines={1}>{e.input.name}</Text>
            {e.error && <Text variant="caption" color="danger">{e.error}</Text>}
          </View>
          <StatusPill label={STATUS_LABEL[e.status]} tone={tone(e)} />
          {e.status === 'error' && (
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => { retryEntry(e.id); void syncQuickCustomers(); }}><Text variant="label" color="primary">Tentar de novo</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => discardEntry(e.id)}><Text variant="label" color="danger">Descartar</Text></Pressable>
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
