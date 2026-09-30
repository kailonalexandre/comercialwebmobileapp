import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/features/shell/app-header';
import { Icon, type IconName } from '@/shared/components/icon';
import { IconTile } from '@/shared/components/icon-tile';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { colors, radius, spacing, touchTarget, type Tone } from '@/shared/theme/tokens';
import { normalizeSearch } from '@/shared/utils/format';

type Module = { title: string; description: string; icon: IconName; tone: Tone; href?: '/configuracoes' | '/pedidos' };

// Espelha os módulos do ComercialWeb (app/Modules). Cada item vira rota quando a feature existir.
const modules: Module[] = [
  { title: 'Comercial', description: 'Vendas, PDV, condicionais e caixa', icon: 'cart-outline', tone: 'primary' },
  { title: 'Cadastros', description: 'Clientes, produtos, fornecedores e mais', icon: 'person-outline', tone: 'primary' },
  { title: 'Financeiro', description: 'Contas a receber, a pagar e fluxo de caixa', icon: 'cash-outline', tone: 'success' },
  { title: 'Estoque', description: 'Movimentações, inventário e relatórios', icon: 'cube-outline', tone: 'info' },
  { title: 'Compras e Entradas', description: 'Pedidos, entradas e notas fiscais', icon: 'bus-outline', tone: 'primary' },
  { title: 'Relatórios', description: 'Vendas, estoque, financeiro e mais', icon: 'bar-chart-outline', tone: 'primary' },
  { title: 'Loja Virtual', description: 'Produtos, pedidos e configurações', icon: 'storefront-outline', tone: 'accent', href: '/pedidos' },
  { title: 'Configurações', description: 'Empresa, usuários e preferências', icon: 'settings-outline', tone: 'info', href: '/configuracoes' },
];

export function MenuScreen() {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return modules;
    return modules.filter((m) => normalizeSearch(`${m.title} ${m.description}`).includes(q));
  }, [query]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader />
        <View style={styles.titleBlock}>
          <Text variant="title">Menu</Text>
          <Text color="textMuted">Acesse todos os módulos do sistema.</Text>
        </View>

        <TextField
          icon="search-outline"
          placeholder="Buscar no menu"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />

        {visible.length === 0 && <StateView kind="empty" message="Nenhum módulo encontrado." />}
        {visible.map((m) => (
          <Pressable
            key={m.title}
            accessibilityRole="button"
            accessibilityLabel={`${m.title}. ${m.description}`}
            onPress={() => (m.href ? router.push(m.href) : Alert.alert(m.title, 'Em breve.'))}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <IconTile icon={m.icon} tone={m.tone} size={52} />
            <View style={styles.flex}>
              <Text variant="label" style={styles.itemTitle}>
                {m.title}
              </Text>
              <Text variant="caption" color="textMuted">
                {m.description}
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  flex: { flex: 1, gap: 2 },
  titleBlock: { gap: spacing.xs, marginVertical: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.md,
    minHeight: touchTarget + spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  itemTitle: { fontSize: 17, lineHeight: 22 },
  pressed: { opacity: 0.7 },
});
