import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSalesReport } from '@/features/management/management-api';
import { formatDate, methodLabel, periodStart } from '@/features/management/management-model';
import { ChipRow } from '@/shared/components/chip-row';
import { Icon } from '@/shared/components/icon';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { userMessage } from '@/shared/utils/error-message';
import { layout, radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

type Period = '7' | '30' | '90';
const PERIODS: { key: Period; label: string }[] = [
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
  { key: '90', label: '90 dias' },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Text variant="label">{title}</Text>
      {children}
    </View>
  );
}

// Relatórios: vendas finalizadas do período (total, ticket médio, por dia e por forma de pagamento).
export function ReportsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>('30');
  const from = useMemo(() => periodStart(Number(period), new Date()), [period]);
  const fetcher = useCallback(() => fetchSalesReport(from), [from]);
  const { data, failure, error, reload } = useDetail(fetcher);
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="title">Relatórios</Text>
      </View>
      <View style={styles.chips}>
        <ChipRow options={PERIODS} selected={period} onSelect={setPeriod} />
      </View>
      {failure ? (
        <StateView kind="error" message={userMessage(error) ?? 'Não foi possível carregar o relatório.'} onRetry={reload} />
      ) : !data ? (
        <StateView kind="loading" />
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
          <Block title="Vendas no período">
            <Text variant="total">{formatCents(data.totalCents)}</Text>
            <Text variant="caption" color="textMuted">
              {data.count} {data.count === 1 ? 'venda' : 'vendas'} · ticket médio {formatCents(data.averageTicketCents)}
            </Text>
          </Block>
          <Block title="Por forma de pagamento">
            {data.byMethod.length === 0 && <Text color="textMuted">Sem vendas no período.</Text>}
            {data.byMethod.map((m) => (
              <View key={m.method} style={styles.between}>
                <Text>{methodLabel(m.method)}</Text>
                <Text variant="label">{formatCents(m.totalCents)}</Text>
              </View>
            ))}
          </Block>
          <Block title="Por dia">
            {[...data.byDay].reverse().map((d) => (
              <View key={d.day} style={styles.between}>
                <Text>{formatDate(d.day)} · {d.count} {d.count === 1 ? 'venda' : 'vendas'}</Text>
                <Text variant="label">{formatCents(d.totalCents)}</Text>
              </View>
            ))}
          </Block>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  chips: { ...layout.content, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
}));
