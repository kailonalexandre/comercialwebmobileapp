import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { fetchProductGroups, fetchProducts, type Product, type ProductGroup } from '@/features/catalog/products-api';
import { ListScreen } from '@/features/shell/list-screen';
import { Icon } from '@/shared/components/icon';
import { OrderChip } from '@/shared/components/order-ui';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { formatCents, formatMilli } from '@/shared/utils/format';

type CatalogProps = {
  title: string;
  subtitle?: string;
  table: string;
  onBack?: () => void;
  action?: ReactElement;
  tablePicker?: ReactElement;
  footer?: ReactElement;
  renderProduct: (product: Product, grid: boolean) => ReactElement;
};

export function ProductCatalog({ title, subtitle, table, onBack, action, tablePicker, footer, renderProduct }: CatalogProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [grid, setGrid] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [groupId, setGroupId] = useState<number>();
  const [groups, setGroups] = useState<ProductGroup[]>([]);

  useEffect(() => {
    let active = true;
    void fetchProductGroups().then((result) => { if (active) setGroups(result); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const fetchPage = useCallback((page: number, search: string) => fetchProducts(page, search, table, { groupId, inStock }), [table, groupId, inStock]);

  return (
    <ListScreen
      orderLayout
      grid={grid}
      scanBarcode
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      action={action}
      searchPlaceholder="Buscar por nome, código ou referência"
      emptyMessage="Nenhum produto encontrado."
      filterKey={JSON.stringify([table, groupId, inStock])}
      fetchPage={fetchPage}
      keyOf={(p) => String(p.id)}
      renderRow={(p) => renderProduct(p, grid)}
      footer={footer}
      searchAction={
        <Pressable accessibilityRole="button" accessibilityLabel={grid ? 'Mostrar lista' : 'Mostrar grade'} onPress={() => setGrid((v) => !v)} style={styles.toggle}>
          <Icon name={grid ? 'list-outline' : 'grid-outline'} size={24} color={colors.primary} />
        </Pressable>
      }
      filters={
        <View style={styles.filters}>
          {tablePicker}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.groups}>
            <OrderChip label="Todos" selected={groupId === undefined} onPress={() => setGroupId(undefined)} />
            {groups.map((g) => <OrderChip key={g.id} label={g.name} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />)}
          </ScrollView>
        </View>
      }
      listControls={(total) => (
        <View style={styles.summary}>
          <Text variant="caption" color="textMuted">{total === 1 ? '1 produto' : `${total} produtos`}</Text>
          <OrderChip label="Só com estoque" icon="cube-outline" compact selected={inStock} onPress={() => setInStock((v) => !v)} />
        </View>
      )}
    />
  );
}

export function ProductImage({ uri, size = 28 }: { uri?: string | null; size?: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [failedUri, setFailedUri] = useState<string>();
  return uri && failedUri !== uri
    ? <Image source={{ uri }} style={styles.image} resizeMode="contain" onError={() => setFailedUri(uri)} />
    : <Icon name="cube-outline" size={size} color={colors.textMuted} />;
}

export function ProductStockLabel({ stock, unit, plain }: { stock: number | null | undefined; unit?: string | null; plain?: boolean }) {
  if (stock == null) return null;
  const label = stock > 0 ? [formatMilli(stock), unit].filter(Boolean).join(' ') : 'Sem estoque';
  const tone = stock > 0 ? 'success' : 'danger';
  return plain ? <Text variant="caption" color={tone}>{label}</Text> : <StatusPill tone={tone} label={label} />;
}

export function ProductCard({ product, grid, controls, onPress }: {
  product: Product; grid: boolean; controls?: ReactElement; onPress?: () => void;
}) {
  const styles = useStyles();
  const body = (
    <>
      <View style={[styles.thumb, grid && styles.gridThumb]}>
        <ProductImage uri={product.imageUrl} size={grid ? 48 : 28} />
      </View>
      <View style={styles.productInfo}>
        <Text variant="label" numberOfLines={2} style={grid && styles.gridName}>{product.name}</Text>
        {!grid && <Text variant="monoSmall" color="textMuted" numberOfLines={1}>{[product.code, product.sku || product.barcode].filter(Boolean).join(' · ')}</Text>}
        <View style={[styles.productPrice, grid && styles.gridPrice]}>
          <Text variant="label" color={product.priceCents == null ? 'textMuted' : 'primary'}>{product.priceCents == null ? 'Sem preço' : formatCents(product.priceCents)}</Text>
          <ProductStockLabel stock={product.stockMilli} unit={product.unit} plain={grid} />
        </View>
      </View>
    </>
  );
  const bodyStyle = grid ? styles.gridBody : styles.rowBody;

  return (
    <View style={[styles.card, grid && styles.gridCard]}>
      {onPress
        ? <Pressable accessibilityRole="button" onPress={onPress} style={bodyStyle}>{body}</Pressable>
        : <View style={bodyStyle}>{body}</View>}
      {controls && <View style={[styles.controls, grid && styles.gridControls]}>{controls}</View>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  toggle: { width: touchTarget, height: touchTarget, backgroundColor: colors.primarySoft, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: spacing.sm },
  groups: { gap: spacing.sm },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: -spacing.sm },
  card: { flex: 1, padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.background },
  gridCard: { padding: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gridThumb: { width: '100%', height: undefined, aspectRatio: 1 },
  image: { width: '100%', height: '100%', backgroundColor: colors.textInverse },
  rowBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gridBody: { gap: spacing.xs, flex: 1 },
  productInfo: { flex: 1, gap: spacing.xs, minWidth: 0 },
  productPrice: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: spacing.sm, marginTop: spacing.xs },
  gridPrice: { flexDirection: 'column', alignItems: 'flex-start' },
  gridName: { minHeight: 40 },
  controls: { borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.sm, alignItems: 'flex-end' },
  gridControls: { borderTopWidth: 0, paddingTop: 0, alignItems: 'stretch' },
}));
