import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductCard, ProductCatalog } from '@/features/catalog/product-catalog';
import type { Product } from '@/features/catalog/products-api';
import { fetchCustomers } from '@/features/customers/customers-api';
import { CustomerRow, NewCustomerButton } from '@/features/customers/customers-screen';
import { inActiveBusiness, useQuickCustomerQueue } from '@/features/customers/quick-customer-queue';
import { addItem, estimateCents, MAX_ITEMS, MAX_QUANTITY, newestFirst, removeItem, setQuantity } from '@/features/presale/draft-model';
import { useTargetDraft } from '@/features/presale/target-draft';
import { suggestedTable } from '@/features/pricing/price-table-model';
import { usePriceTables } from '@/features/pricing/price-tables';
import { ListScreen } from '@/features/shell/list-screen';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { OrderFooter, OrderHeader } from '@/shared/components/order-ui';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { layout, radius, spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

const quantityLabel = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function PickProductScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { draft, setDraft, phase } = useTargetDraft(mode);
  const { colors } = useTheme();
  const styles = useStyles();
  const [items, setItems] = useState(draft.items);
  const [showCart, setShowCart] = useState(false);
  const total = estimateCents(items, draft.saleDiscount);
  const units = items.reduce((n, i) => n + i.quantity, 0);

  function changeQuantity(product: Product, delta: 1 | -1) {
    setItems((current) => {
      const item = current.find((i) => i.productId === product.id);
      const next = Math.max(0, Math.min(MAX_QUANTITY, Math.round(((item?.quantity ?? 0) + delta) * 1000) / 1000));
      if (item) return next > 0 ? setQuantity(current, product.id, next) : removeItem(current, product.id);
      return product.priceCents === null || next === 0
        ? current
        : addItem(current, { productId: product.id, name: product.name, unitPriceCents: product.priceCents }, next);
    });
  }

  function finish() {
    if (phase.name === 'editing') setDraft((d) => ({ ...d, items }));
    router.back();
  }

  return (
    <>
      <ProductCatalog
        title="Adicionar produtos"
        table={draft.priceTable}
        onBack={() => router.back()}
        renderProduct={(product, grid) => {
          const quantity = items.find((i) => i.productId === product.id)?.quantity ?? 0;
          return (
            <ProductCard product={product} grid={grid} controls={
              <View style={[styles.quantity, !grid && styles.listQuantity]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir quantidade de ${product.name}`} disabled={quantity === 0}
                  onPress={() => changeQuantity(product, -1)} style={[styles.step, quantity === 0 && styles.disabled]}>
                  <Icon name="remove" size={22} color={colors.primary} />
                </Pressable>
                <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.quantityValue} accessibilityLabel={`Quantidade de ${product.name}: ${quantityLabel.format(quantity)}`}>{quantityLabel.format(quantity)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar quantidade de ${product.name}`}
                  disabled={quantity >= MAX_QUANTITY || (quantity === 0 && (items.length >= MAX_ITEMS || product.priceCents == null))}
                  onPress={() => changeQuantity(product, 1)}
                  style={[styles.step, styles.plus, (quantity >= MAX_QUANTITY || (quantity === 0 && (items.length >= MAX_ITEMS || product.priceCents == null))) && styles.disabled]}>
                  <Icon name="add" size={22} color={colors.onPrimary} />
                </Pressable>
              </View>
            } />
          );
        }}
        footer={
          <OrderFooter>
            <Pressable accessibilityRole="button" accessibilityLabel="Ver carrinho" onPress={() => { Keyboard.dismiss(); setShowCart(true); }} style={styles.cartSummary}>
              <View style={styles.round}><Icon name="cart-outline" size={22} color={colors.primary} /></View>
              <View style={styles.grow}>
                <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit color="textMuted">{quantityLabel.format(units)} unidades · ver</Text>
                <Text variant="total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatCents(total)}</Text>
              </View>
            </Pressable>
            <Button label="Concluir" icon="checkmark" onPress={finish} />
          </OrderFooter>
        }
      />
      <Modal visible={showCart} onRequestClose={() => setShowCart(false)} animationType="slide" statusBarTranslucent navigationBarTranslucent>
        <SafeAreaView edges={['top']} style={styles.root}>
          <OrderHeader title="Carrinho" onBack={() => setShowCart(false)} />
          <ScrollView contentContainerStyle={styles.cartContents}>
            {items.length === 0 && <Text color="textMuted">Carrinho vazio</Text>}
            {newestFirst(items).map((item) => (
              <View key={item.productId} style={styles.cartRow}>
                <View style={styles.grow}>
                  <Text variant="label">{item.name}</Text>
                  <Text variant="caption" color="textMuted">{quantityLabel.format(item.quantity)} · {formatCents(estimateCents([item]))}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item.name}`} style={styles.step} onPress={() => setItems((current) => removeItem(current, item.productId))}>
                  <Icon name="trash-outline" color={colors.danger} size={20} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <OrderFooter>
            <View style={styles.grow}>
              <Text variant="caption" color="textMuted">Total</Text>
              <Text variant="total">{formatCents(total)}</Text>
            </View>
            <Button label="Concluir" icon="checkmark" onPress={finish} />
          </OrderFooter>
        </SafeAreaView>
      </Modal>
    </>
  );
}

export function PickCustomerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { draft, setDraft } = useTargetDraft(mode);
  const { tables } = usePriceTables();
  const canClear = mode !== 'conditional' && (mode === 'pdv' || draft.customer !== null);
  const waiting = useQuickCustomerQueue().filter((e) => (e.status === 'pending' || e.status === 'syncing') && inActiveBusiness(e));
  const choose = (customer: { id: number; name: string; pendingId?: string } | null, tradeScope?: string | null) => {
    const suggested = suggestedTable(tradeScope, tables);
    setDraft((d) => ({ ...d, customer, priceTable: suggested && d.items.length === 0 ? suggested : d.priceTable }));
    router.back();
  };
  return (
    <ListScreen
      orderLayout
      title="Escolher cliente"
      action={<NewCustomerButton mode={mode ?? 'presale'} />}
      searchPlaceholder="Buscar por nome, CNPJ/CPF ou código"
      emptyMessage="Nenhum cliente encontrado."
      fetchPage={fetchCustomers}
      keyOf={(c) => String(c.id)}
      onBack={() => router.back()}
      filters={
        (waiting.length > 0 || canClear) ? (
          <>
            {canClear && <Button label="Consumidor final (sem cliente)" variant="outline" onPress={() => choose(null)} />}
            {waiting.map((e) => (
              <ListRow key={e.id} title={e.input.name} lines={['Cadastro aguardando sincronização']} onPress={() => choose({ id: 0, name: e.input.name, pendingId: e.id })} trailing={<StatusPill label="Pendente" tone="primary" />} />
            ))}
          </>
        ) : undefined
      }
      renderRow={(c) => (
        <CustomerRow customer={c}
          onPress={c.restrictionBlock ? undefined : () => choose({ id: c.id, name: c.name }, c.tradeScope)}
          trailing={c.restrictionBlock ? <StatusPill label="Bloqueado" tone="danger" /> : undefined}
        />
      )}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  quantity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  listQuantity: { width: 144 },
  quantityValue: { flex: 1, textAlign: 'center' },
  step: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  plus: { backgroundColor: colors.primary },
  disabled: { opacity: 0.35 },
  round: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  grow: { flex: 1 },
  cartSummary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartContents: { ...layout.content, padding: spacing.lg, gap: spacing.sm },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.background },
}));
