import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/session-context';
import { Icon, type IconName } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { layout, radius, spacing } from '@/shared/theme/tokens';

const destinations: { key: string; title: string; icon: IconName; href: Href; permission?: string }[] = [
  { key: 'home', title: 'Início', icon: 'home-outline', href: '/' },
  { key: 'sales', title: 'Pedidos', icon: 'receipt-outline', href: '/vendas', permission: 'sales.view' },
  { key: 'order', title: 'Novo pedido', icon: 'add', href: '/nova-venda', permission: 'sales.create' },
  { key: 'customers', title: 'Clientes', icon: 'people-outline', href: '/clientes', permission: 'people.view' },
  { key: 'products', title: 'Produtos', icon: 'pricetag-outline', href: '/produtos', permission: 'products.view' },
];

export function OrderNavigation({ active }: { active: 'products' | 'customers' }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { profile } = useSession();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottom, spacing.sm) }]}>
      <View style={styles.row}>
        {destinations.filter((d) => d.key === active || !d.permission || profile?.permissions.includes(d.permission)).map((d) => {
          const current = d.key === active;
          const order = d.key === 'order';
          return (
            <Pressable key={d.key} accessibilityRole="tab" accessibilityState={{ selected: current }} onPress={() => {
              if (current) return;
              if (order) router.push(d.href);
              else router.dismissTo(d.href);
            }} style={styles.tab}>
              <View style={order ? styles.order : styles.icon}>
                <Icon name={current && d.key === 'products' ? 'pricetag' : d.icon} size={order ? 30 : 25} color={order ? colors.onPrimary : current ? colors.primary : colors.textMuted} />
              </View>
              <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} color={current ? 'primary' : 'textMuted'}>{d.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: { backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.border },
  row: { ...layout.content, flexDirection: 'row', minHeight: 64 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs, paddingBottom: spacing.sm },
  icon: { height: 28, justifyContent: 'center' },
  order: { backgroundColor: colors.primary, width: 48, height: 48, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginTop: -spacing.md },
}));
