import { router } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/session-context';
import { formatLocal } from '@/features/dashboard/dashboard-model';
import { useDashboard } from '@/features/dashboard/use-dashboard';
import { statusLabel, statusTone } from '@/features/sales/sales-model';
import { useUnreadCount } from '@/features/shell/use-unread-count';
import { EnvBadge } from '@/shared/components/env-badge';
import { Icon, type IconName } from '@/shared/components/icon';
import { StateView } from '@/shared/components/state-view';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { colors, fonts, radius, shadow, spacing, tones, type Tone } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const soon = (title: string) => () => Alert.alert(title, 'Em breve.');

function greeting(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

type QuickAction = { label: string; icon: IconName; permission: string; onPress: () => void };

// Só aparece o que o usuário pode usar (a API confere de novo em cada rota).
const quickActions: QuickAction[] = [
  { label: 'Pré-venda', icon: 'document-text-outline', permission: 'sales.create', onPress: () => router.push('/nova-venda') },
  { label: 'PDV', icon: 'barcode-outline', permission: 'pdv.access', onPress: () => router.navigate('/pdv') },
  { label: 'Produtos', icon: 'pricetag-outline', permission: 'products.view', onPress: () => router.push('/produtos') },
  { label: 'Clientes', icon: 'people-outline', permission: 'people.view', onPress: () => router.push('/clientes') },
];

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading">{title}</Text>
      {action && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={spacing.md}>
          <Text variant="label" color="primary">
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function AttentionCard({ icon, tone, title, detail, onPress }: { icon: IconName; tone: Tone; title: string; detail: string; onPress: () => void }) {
  const t = tones[tone];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} style={({ pressed }) => [styles.attention, pressed && styles.pressed]}>
      <View style={[styles.attentionIcon, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={20} color={t.fg} />
      </View>
      <View>
        <Text variant="label">{title}</Text>
        <Text variant="caption" color="textMuted">
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

export function DashboardScreen() {
  const { data, failed, reload } = useDashboard();
  const { profile } = useSession();
  const unread = useUnreadCount();

  if (!data) return failed ? <StateView kind="error" onRetry={reload} /> : <StateView kind="loading" />;
  const now = new Date();
  const recentSales = data.recentSales ?? [];
  const firstName = profile?.userName.split(' ')[0] ?? '';
  const sales = data.salesToday;
  const average = sales && sales.count > 0 ? Math.round(sales.totalCents / sales.count) : 0;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Empresa atual: ${profile?.businessName ?? ''}. Trocar empresa`} onPress={soon('Trocar empresa')} style={[styles.company, styles.flex]}>
            <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.shrink}>
              {profile?.businessName ?? '…'}
            </Text>
            <Icon name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Notificações, ${unread} não lidas`} onPress={() => router.push('/notificacoes')} style={styles.roundButton}>
            <Icon name="notifications-outline" size={22} color={colors.text} />
            {unread > 0 && <View style={styles.dot} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={firstName ? `Perfil de ${firstName}` : 'Perfil'} onPress={() => router.push('/configuracoes')} style={[styles.roundButton, styles.avatar]}>
            <Text variant="label" color="onPrimary">
              {firstName.charAt(0).toUpperCase() || '·'}
            </Text>
          </Pressable>
        </View>
        {/* Linha própria: o nome nunca disputa espaço com os botões; nome muito longo encolhe em vez de cortar. */}
        <Text variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.greetingTitle}>
          {firstName ? `${greeting(now.getHours())}, ${firstName}` : greeting(now.getHours())}
        </Text>

        <EnvBadge />

        {sales && (
          <View style={styles.hero}>
            <View style={styles.heroCircle} />
            <View style={styles.between}>
              <Text color="textInverseMuted">Vendas hoje</Text>
              <View style={styles.dateChip}>
                <Text variant="caption" color="textInverse" style={styles.dateText}>
                  {now.getDate()} {MONTHS[now.getMonth()]}
                </Text>
              </View>
            </View>
            <Text style={styles.heroValue}>{formatCents(sales.totalCents)}</Text>
            <Text variant="caption" color="textInverseMuted">
              {sales.count} {sales.count === 1 ? 'venda finalizada' : 'vendas finalizadas'}
            </Text>
            <View style={styles.heroRow}>
              {data.receivables && (
                <View style={styles.heroStat}>
                  <Text variant="caption" color="textInverseMuted">
                    A receber
                  </Text>
                  <Text variant="label" color="textInverse">
                    {formatCents(data.receivables.totalCents)}
                  </Text>
                  <Text variant="caption" color="textInverseMuted">
                    {data.receivables.count} {data.receivables.count === 1 ? 'título' : 'títulos'}
                  </Text>
                </View>
              )}
              <View style={styles.heroStat}>
                <Text variant="caption" color="textInverseMuted">
                  Ticket médio
                </Text>
                <Text variant="label" color="textInverse">
                  {formatCents(average)}
                </Text>
                <Text variant="caption" color="textInverseMuted">
                  hoje
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.quickRow}>
          {quickActions
            .filter((a) => profile?.permissions.includes(a.permission))
            .map((a) => (
              <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} onPress={a.onPress} style={styles.quick}>
                <View style={styles.quickIcon}>
                  <Icon name={a.icon} size={24} color={colors.primary} />
                </View>
                <Text variant="caption" style={styles.quickLabel}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
        </View>

        {(data.lowStockCount !== null || data.openConditionals !== null) && (
          <>
            <SectionHeader title="Precisa de atenção" />
            <View style={styles.attentionRow}>
              {data.lowStockCount !== null && (
                <AttentionCard
                  icon="warning-outline"
                  tone="warning"
                  title={data.lowStockCount === 0 ? 'Estoque em dia' : `${data.lowStockCount} ${data.lowStockCount === 1 ? 'item em falta' : 'itens em falta'}`}
                  detail={data.lowStockCount === 0 ? 'Nada para repor' : 'Precisa de reposição'}
                  onPress={() => router.push('/produtos')}
                />
              )}
              {data.openConditionals !== null && (
                <AttentionCard
                  icon="document-text-outline"
                  tone="primary"
                  title={`${data.openConditionals.count} ${data.openConditionals.count === 1 ? 'condicional' : 'condicionais'}`}
                  detail={`${formatCents(data.openConditionals.totalCents)} em aberto`}
                  onPress={soon('Condicionais')}
                />
              )}
            </View>
          </>
        )}

        {data.recentSales !== null && (
          <>
            <SectionHeader title="Últimas vendas" action="Ver todas" onAction={() => router.navigate('/vendas')} />
            {recentSales.length === 0 && (
              <Text color="textMuted" style={styles.empty}>
                Nenhuma venda ainda.
              </Text>
            )}
            {recentSales.map((sale) => (
              <Pressable
                key={sale.id}
                accessibilityRole="button"
                accessibilityLabel={`${sale.customerName ?? 'Consumidor final'}, ${formatCents(sale.totalCents)}`}
                onPress={() => router.push({ pathname: '/venda/[id]', params: { id: String(sale.id) } })}
                style={({ pressed }) => [styles.saleRow, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text variant="label" numberOfLines={1}>
                    {sale.customerName ?? 'Consumidor final'}
                  </Text>
                  <Text variant="mono" color="textMuted" style={styles.mono} numberOfLines={1}>
                    {sale.number ? `${sale.number} · ` : ''}
                    {formatLocal(sale.occurredAt)}
                  </Text>
                </View>
                <View style={styles.saleEnd}>
                  <Text variant="label">{formatCents(sale.totalCents)}</Text>
                  <StatusPill label={statusLabel(sale.status)} tone={statusTone(sale.status)} />
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greetingTitle: { marginTop: -spacing.sm },
  company: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roundButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  avatar: { backgroundColor: colors.primary },
  dot: { position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.badge },
  hero: { gap: spacing.xs, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.primary, overflow: 'hidden', ...shadow.raised },
  heroCircle: { position: 'absolute', top: -60, right: -50, width: 190, height: 190, borderRadius: radius.pill, backgroundColor: colors.overlay },
  dateChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.overlay },
  dateText: { fontFamily: fonts.bold },
  heroValue: { fontFamily: fonts.bold, fontSize: 38, lineHeight: 46, color: colors.textInverse },
  heroRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  heroStat: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.overlay },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quick: { flex: 1, alignItems: 'center', gap: spacing.sm },
  quickIcon: { width: 58, height: 58, borderRadius: radius.lg, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  quickLabel: { fontFamily: fonts.semibold, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  attentionRow: { flexDirection: 'row', gap: spacing.md },
  attention: { flex: 1, gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  attentionIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  saleEnd: { alignItems: 'flex-end', gap: spacing.xs },
  mono: { fontSize: 12, lineHeight: 16 },
  empty: { paddingVertical: spacing.lg, textAlign: 'center' },
});
