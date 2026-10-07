import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/session-context';
import { EnvBadge } from '@/shared/components/env-badge';
import { type IconName } from '@/shared/components/icon';
import { IconTile } from '@/shared/components/icon-tile';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { layout, radius, shadow, spacing, type Tone } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';
import { normalizeSearch } from '@/shared/utils/format';

type Module = { title: string; description: string; icon: IconName; tone: Tone; permissions?: string[]; href: '/configuracoes' | '/pedidos' | '/financeiro' | '/compras' | '/relatorios' | '/modulo/comercial' | '/modulo/cadastros' | '/modulo/estoque' };

// Módulos do ComercialWeb com tela no app. `permissions`: basta uma (mesma regra da web); só esconde o atalho, o servidor confere de novo.
const modules: Module[] = [
  { title: 'Comercial', description: 'Vendas, PDV e condicionais', icon: 'cart-outline', tone: 'primary', href: '/modulo/comercial' },
  { title: 'Cadastros', description: 'Clientes e produtos', icon: 'person-outline', tone: 'primary', href: '/modulo/cadastros' },
  { title: 'Financeiro', description: 'Contas a receber e a pagar', icon: 'cash-outline', tone: 'success', permissions: ['financial.receivables.view', 'financial.payables.view'], href: '/financeiro' },
  { title: 'Estoque', description: 'Consulta de saldo por produto', icon: 'cube-outline', tone: 'info', href: '/modulo/estoque' },
  { title: 'Compras e Entradas', description: 'Consulta de pedidos de compra', icon: 'bus-outline', tone: 'primary', permissions: ['purchases.access'], href: '/compras' },
  { title: 'Relatórios', description: 'Vendas por período e forma de pagamento', icon: 'bar-chart-outline', tone: 'primary', permissions: ['relatorios.access'], href: '/relatorios' },
  { title: 'Loja Virtual', description: 'Produtos, pedidos e configurações', icon: 'storefront-outline', tone: 'accent', href: '/pedidos' },
  { title: 'Configurações', description: 'Empresa, usuários e preferências', icon: 'settings-outline', tone: 'info', href: '/configuracoes' },
];

export function MenuScreen() {
  const styles = useStyles();
  const { profile } = useSession();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    const allowed = modules.filter((m) => !m.permissions || m.permissions.some((p) => profile?.permissions.includes(p)));
    if (!q) return allowed;
    return allowed.filter((m) => normalizeSearch(`${m.title} ${m.description}`).includes(q));
  }, [query, profile]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title">Menu</Text>

        <Pressable accessibilityRole="button" accessibilityLabel="Configurações da conta" onPress={() => router.push('/configuracoes')} style={styles.user}>
          <View style={styles.avatar}>
            <Text variant="heading" color="onPrimary">
              {profile?.userName.charAt(0).toUpperCase() || '·'}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="label">{profile?.userName ?? '…'}</Text>
            <Text variant="caption" color="textMuted">
              {profile?.businessName ?? ''}
            </Text>
          </View>
          <EnvBadge />
        </Pressable>

        <TextField icon="search-outline" placeholder="Buscar módulo" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />

        {visible.length === 0 && <StateView kind="empty" message="Nenhum módulo encontrado." />}
        <View style={styles.grid}>
          {visible.map((m) => (
            <Pressable
              key={m.title}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}. ${m.description}`}
              onPress={() => router.push(m.href)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <IconTile icon={m.icon} tone={m.tone} size={40} />
              <Text variant="label">{m.title}</Text>
              <Text variant="caption" color="textMuted">
                {m.description}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  flex: { flex: 1 },
  user: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  item: { flexBasis: '47%', flexGrow: 1, gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  pressed: { opacity: 0.7 },
}));
