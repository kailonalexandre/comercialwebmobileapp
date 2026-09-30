import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useSession } from '@/features/auth/session-context';
import { formatLocal, toKpis, type Kpi } from '@/features/dashboard/dashboard-model';
import { useDashboard } from '@/features/dashboard/use-dashboard';
import { AppHeader } from '@/features/shell/app-header';
import { EnvBadge } from '@/shared/components/env-badge';
import { Icon, type IconName } from '@/shared/components/icon';
import { StateView } from '@/shared/components/state-view';
import { IconTile } from '@/shared/components/icon-tile';
import { Text } from '@/shared/components/text';
import { colors, radius, shadow, spacing, tones } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

const soon = (title: string) => () => Alert.alert(title, 'Em breve.');

type QuickAction = { label: string; hint: string; icon: IconName; permission?: string; onPress: () => void };

// Sem `permission` = ainda não implementado (aviso "Em breve"), sempre visível como no mockup.
const quickActions: QuickAction[] = [
  { label: 'Nova Venda', hint: 'Lançar pré-venda', icon: 'cart-outline', permission: 'sales.create', onPress: () => router.push('/nova-venda') },
  { label: 'PDV', hint: 'Abrir o caixa', icon: 'calculator-outline', onPress: soon('PDV') },
  { label: 'Produtos', hint: 'Consultar produtos', icon: 'cube-outline', permission: 'products.view', onPress: () => router.push('/produtos') },
  { label: 'Clientes', hint: 'Consultar clientes', icon: 'people-outline', permission: 'people.view', onPress: () => router.push('/clientes') },
];

function KpiCard({ kpi }: { kpi: Kpi }) {
  const t = tones[kpi.tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kpi.label}: ${kpi.value}, ${kpi.detail}`}
      onPress={soon(kpi.label)}
      style={[styles.kpi, { backgroundColor: t.tint, borderColor: t.border }]}
    >
      <View style={styles.kpiTop}>
        <IconTile icon={kpi.icon} tone={kpi.tone} size={40} />
        <Icon name="chevron-forward" size={18} color={colors.text} />
      </View>
      <Text variant="caption">{kpi.label}</Text>
      <Text variant="value">{kpi.value}</Text>
      <Text variant="caption" color="textMuted">
        {kpi.detail}
      </Text>
    </Pressable>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading">{title}</Text>
      <Pressable accessibilityRole="button" onPress={onAction} hitSlop={spacing.md}>
        <Text variant="label" color="primary">
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

export function DashboardScreen() {
  const { data, failed, reload } = useDashboard();
  const { profile } = useSession();

  if (!data) return failed ? <StateView kind="error" onRetry={reload} /> : <StateView kind="loading" />;
  const kpis = toKpis(data);
  const recentSales = data.recentSales ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
        <AppHeader />

        <View style={styles.greeting}>
          <View style={styles.flex}>
            <Text variant="title" style={styles.hello}>
              {profile ? `Olá, ${profile.userName}` : 'Olá'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Empresa atual: ${profile?.businessName ?? ''}. Trocar empresa`}
              onPress={soon('Trocar empresa')}
              style={styles.company}
            >
              <Text color="textMuted" numberOfLines={1} style={styles.shrink}>
                Empresa atual: <Text color="text">{profile?.businessName ?? '…'}</Text>
              </Text>
              <Icon name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          <EnvBadge />
        </View>

        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <Svg width={180} height={80} viewBox="0 0 180 80" style={styles.bannerCurve}>
            <Path d="M0 70 C 50 70, 70 30, 110 45 S 160 10, 180 5" stroke={colors.overlayBorder} strokeWidth={2} fill="none" />
          </Svg>
          <View style={styles.bannerIcon}>
            <Icon name="trending-up" size={28} color={colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <Text variant="label" color="textInverse" style={styles.bannerTitle}>
              Vamos crescer hoje!
            </Text>
            <Text variant="caption" color="textInverseMuted">
              Acompanhe suas vendas e mantenha tudo em dia.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.grid}>
          {kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </View>

        <SectionHeader title="Acesso rápido" action="Ver todos" onAction={() => router.navigate('/menu')} />
        <View style={styles.grid}>
          {quickActions.filter((a) => !a.permission || profile?.permissions.includes(a.permission)).map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={`${a.label}, ${a.hint}`}
              onPress={a.onPress}
              style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
            >
              <IconTile icon={a.icon} size={40} />
              <View style={styles.flex}>
                <Text variant="label" numberOfLines={1}>
                  {a.label}
                </Text>
                <Text variant="caption" color="textMuted">
                  {a.hint}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {data.recentSales !== null && (
          <>
            <SectionHeader title="Últimas vendas" action="Ver todas" onAction={() => router.navigate('/vendas')} />
            <View style={styles.list}>
              {recentSales.length === 0 && (
                <Text color="textMuted" style={styles.empty}>
                  Nenhuma venda ainda.
                </Text>
              )}
              {recentSales.map((sale, i) => (
                <View key={sale.id} style={[styles.saleRow, i > 0 && styles.divider]}>
                  <IconTile icon="receipt-outline" size={36} />
                  <View style={styles.flex}>
                    <Text variant="label">{sale.customerName ?? 'Consumidor final'}</Text>
                    <Text variant="caption" color="textMuted">
                      {sale.number ? `Nº ${sale.number} · ` : ''}
                      {formatLocal(sale.occurredAt)}
                    </Text>
                  </View>
                  <Text variant="label">{formatCents(sale.totalCents)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  greeting: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  hello: { fontSize: 24, lineHeight: 30 },
  company: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.raised,
  },
  bannerCurve: { position: 'absolute', right: 0, bottom: 0 },
  bannerIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontSize: 18, lineHeight: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpi: { flexBasis: '47%', flexGrow: 1, gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  quick: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.7 },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  empty: { paddingVertical: spacing.lg, textAlign: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
});
