import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { Icon } from '@/shared/components/icon';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';

import { ListScreen } from '@/features/shell/list-screen';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { fetchProducts } from '@/features/catalog/products-api';
import { PriceTablePicker } from '@/features/pricing/price-table-picker';
import { usePriceTables } from '@/features/pricing/price-tables';
import { formatCents } from '@/shared/utils/format';

export function ProductsScreen() {
  const { profile } = useSession();
  const { colors } = useTheme();
  const styles = useStyles();
  const { selected, select } = usePriceTables();
  // Nova identidade quando a tabela muda: a lista recarrega com os preços dela.
  const fetchPage = useCallback((page: number, search: string) => fetchProducts(page, search, selected), [selected]);
  return (
    <ListScreen
      action={
        profile?.permissions.includes('products.create') ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Novo produto" onPress={() => router.push('/novo-produto')} style={styles.newButton}>
            <Icon name="add" size={18} color={colors.primary} />
            <Text variant="label" color="primary">
              Novo
            </Text>
          </Pressable>
        ) : undefined
      }
      filters={<PriceTablePicker value={selected} onChange={select} />}
      title="Produtos"
      searchPlaceholder="Nome, código ou barras"
      emptyMessage="Nenhum produto encontrado."
      fetchPage={fetchPage}
      scanBarcode
      keyOf={(p) => String(p.id)}
      onBack={() => router.back()}
      renderRow={(p) => (
        <ListRow
          title={p.name}
          lines={[`Cód. ${p.code}${p.sku ? ` · SKU ${p.sku}` : ''}`]}
          onPress={() => router.push({ pathname: '/produto/[id]', params: { id: String(p.id) } })}
          trailing={
            <>
              {!p.isActive && <StatusPill label="Inativo" tone="danger" />}
              <Text variant="label" color={p.priceCents === null ? 'textMuted' : 'text'}>{p.priceCents === null ? 'Sem preço' : formatCents(p.priceCents)}</Text>
            </>
          }
        />
      )}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  newButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
}));
