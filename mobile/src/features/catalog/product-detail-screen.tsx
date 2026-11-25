import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductImage, ProductStockLabel } from '@/features/catalog/product-catalog';
import { fetchProduct, fetchProductStock, type ProductDetail } from '@/features/catalog/products-api';
import { usePriceTables } from '@/features/pricing/price-tables';
import { Icon } from '@/shared/components/icon';
import { InfoCard } from '@/shared/components/info-card';
import { OrderHeader } from '@/shared/components/order-ui';
import { StateView } from '@/shared/components/state-view';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { layout, radius, spacing } from '@/shared/theme/tokens';
import { userMessage } from '@/shared/utils/error-message';
import { formatCents } from '@/shared/utils/format';

function priceIn(product: ProductDetail, table: string): string {
  const cents = product.prices?.[table] ?? (table === 'varejo' && !product.prices ? product.salePriceCents : undefined);
  return cents === undefined ? 'Sem preço nesta tabela' : formatCents(cents);
}

export function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const fetcher = useCallback(() => fetchProduct(Number(id)), [id]);
  const { data: product, failure, error, reload } = useDetail(fetcher);
  const { tables, selected } = usePriceTables();
  const stockFetcher = useCallback(() => fetchProductStock(Number(id)), [id]);
  const { data: stock } = useDetail(stockFetcher);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <OrderHeader title="Produto" centered onBack={() => router.back()} />
      {!product && !failure && <StateView kind="loading" />}
      {failure === 'not_found' && <StateView kind="empty" message="Produto não encontrado." />}
      {failure === 'error' && <StateView kind="error" message={userMessage(error)} onRetry={reload} />}
      {product && (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <View style={styles.heroImage}><ProductImage uri={product.imageUrl} size={64} /></View>
              {!!product.imageUrl && (
                <Pressable accessibilityRole="button" accessibilityLabel="Ampliar foto do produto" onPress={() => setExpanded(true)} style={styles.expand}>
                  <Icon name="expand-outline" size={20} color={colors.text} />
                </Pressable>
              )}
            </View>
            <View style={styles.details}>
              <Text variant="monoSmall" color="textMuted">{[product.code, product.unit].filter(Boolean).join(' · ')}</Text>
              <Text variant="heading">{product.name}</Text>
              <View style={styles.price}>
                <Text variant="value" color="primary">{priceIn(product, selected)}</Text>
                <ProductStockLabel stock={stock?.totalMilli} unit={product.unit} />
              </View>
              {!product.isActive && <StatusPill label="Inativo" tone="danger" />}
            </View>
            {(product.sku || product.barcode || product.description) && (
              <InfoCard rows={[
                { label: 'SKU', value: product.sku },
                { label: 'Código de barras', value: product.barcode },
                { label: 'Descrição', value: product.description },
              ]} />
            )}
            {product.prices && tables.length > 1 && (
              <InfoCard rows={tables.map((table) => ({ label: `Tabela ${table.label}`, value: priceIn(product, table.key) }))} />
            )}
          </ScrollView>
          <Modal visible={expanded} onRequestClose={() => setExpanded(false)} animationType="fade" statusBarTranslucent navigationBarTranslucent>
            <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
              <OrderHeader title="Foto do produto" onBack={() => setExpanded(false)} />
              <View style={styles.expanded}><ProductImage uri={product.imageUrl} size={64} /></View>
            </SafeAreaView>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  content: { ...layout.content, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { aspectRatio: 1.5, borderRadius: radius.lg, backgroundColor: colors.background, alignItems: 'center', overflow: 'hidden' },
  heroImage: { aspectRatio: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  expanded: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  expand: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  details: { gap: spacing.xs },
  price: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
}));
