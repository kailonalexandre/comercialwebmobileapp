import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchFinancialSummary } from '@/features/management/management-api';
import { TITLE_NAME, type Totals, type TitleKind } from '@/features/management/management-model';
import { Icon } from '@/shared/components/icon';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { userMessage } from '@/shared/utils/error-message';
import { layout, radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

function SideCard({ kind, open, overdue }: { kind: TitleKind; open: Totals; overdue: Totals }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${TITLE_NAME[kind]}: ${formatCents(open.totalCents)} em aberto, ${formatCents(overdue.totalCents)} vencido`}
      onPress={() => router.push({ pathname: '/titulos/[type]', params: { type: kind } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text variant="label">{TITLE_NAME[kind]}</Text>
      <Text variant="total">{formatCents(open.totalCents)}</Text>
      <Text variant="caption" color="textMuted">{open.count} {open.count === 1 ? 'título em aberto' : 'títulos em aberto'}</Text>
      <Text variant="caption" color={overdue.count > 0 ? 'danger' : 'textMuted'}>
        {overdue.count > 0 ? `${formatCents(overdue.totalCents)} vencido (${overdue.count})` : 'Nada vencido'}
      </Text>
    </Pressable>
  );
}

// Financeiro: resumo do que está em aberto e vencido; só mostra o lado (receber/pagar) que o usuário pode ver.
export function FinancialScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, failure, error, reload } = useDetail(fetchFinancialSummary);
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="title">Financeiro</Text>
      </View>
      {failure ? (
        <StateView kind="error" message={failure === 'error' && userMessage(error) ? userMessage(error) : 'Não foi possível carregar o financeiro.'} onRetry={reload} />
      ) : !data ? (
        <StateView kind="loading" />
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
          {data.receivablesOpen && data.receivablesOverdue && <SideCard kind="receivable" open={data.receivablesOpen} overdue={data.receivablesOverdue} />}
          {data.payablesOpen && data.payablesOverdue && <SideCard kind="payable" open={data.payablesOpen} overdue={data.payablesOverdue} />}
          <Text variant="caption" color="textMuted">Consulta. Lançamentos e baixas continuam no ComercialWeb.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  pressed: { opacity: 0.7 },
}));
