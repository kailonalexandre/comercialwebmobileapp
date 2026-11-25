import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { ProductCard, ProductCatalog } from '@/features/catalog/product-catalog';
import { OrderNavigation } from '@/features/shell/order-navigation';
import { PriceTablePicker } from '@/features/pricing/price-table-picker';
import { usePriceTables } from '@/features/pricing/price-tables';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';

export function ProductsScreen() {
  const { profile } = useSession();
  const { colors } = useTheme();
  const styles = useStyles();
  const { selected, select, tables } = usePriceTables();
  return (
    <ProductCatalog
      title="Produtos"
      subtitle="Preço da tabela do aplicativo"
      table={selected}
      action={
        profile?.permissions.includes('products.create') ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Novo produto" onPress={() => router.push('/novo-produto')} style={styles.newButton}>
            <Icon name="add" size={18} color={colors.primary} />
            <Text variant="label" color="primary">Novo</Text>
          </Pressable>
        ) : undefined
      }
      tablePicker={tables.length > 1 ? <PriceTablePicker value={selected} onChange={select} /> : undefined}
      footer={<OrderNavigation active="products" />}
      renderProduct={(p, grid) => <ProductCard product={p} grid={grid} onPress={() => router.push({ pathname: '/produto/[id]', params: { id: String(p.id) } })} />}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  newButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
}));
