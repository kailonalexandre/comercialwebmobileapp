import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { fetchPricesIn } from '@/features/catalog/products-api';
import { applyPrices } from '@/features/pricing/price-table-model';
import { PriceTablePicker } from '@/features/pricing/price-table-picker';
import { usePriceTables } from '@/features/pricing/price-tables';
import type { DraftValue } from '@/features/presale/draft-context';
import { DiscountField } from '@/features/presale/discount-field';
import { estimateCents, MAX_OBSERVATION, newestFirst, priceOf, removeItem, setPrice, setQuantity } from '@/features/presale/draft-model';
import { ItemPrice } from '@/features/presale/item-price';
import { QuantityStepper } from '@/features/presale/quantity-stepper';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

export type DraftMode = 'presale' | 'pdv' | 'conditional';

// Cliente, itens e observação: igual na pré-venda, no PDV e no condicional. `mode` diz a qual rascunho os seletores
// respondem. `addProducts`: botão próprio da tela (PDV), logo abaixo do cliente; sem ele, o padrão fica depois dos itens.
// `canChangePrice`: só o PDV, para quem tem pdv.change-price (a API e o ComercialWeb conferem de novo).
export function DraftEditor({ store, mode, locked, integerQuantity = false, canDiscount = true, addProducts, canChangePrice = false }: {
  store: DraftValue; mode: DraftMode; locked: boolean; integerQuantity?: boolean; canDiscount?: boolean; addProducts?: ReactNode; canChangePrice?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { draft, setDraft } = store;
  const { tables, selected, select, label } = usePriceTables();
  const [switching, setSwitching] = useState(false);
  // Condicional exige cliente identificado: não existe "Consumidor final" nele.
  const emptyCustomer = mode === 'conditional' ? 'Selecione o cliente' : 'Consumidor final';

  // Operação nova (carrinho vazio) começa na tabela que o usuário vem usando.
  useEffect(() => {
    if (!locked && draft.items.length === 0 && draft.priceTable !== selected) setDraft((d) => ({ ...d, priceTable: selected }));
    // só na abertura: depois disso a tabela da operação é decisão explícita (ou sugestão do cliente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trocar a tabela com itens no carrinho nunca muda valor em silêncio: pergunta e usa os preços do ComercialWeb.
  async function recalculate(key: string) {
    setSwitching(true);
    try {
      const prices = await fetchPricesIn(draft.items.map((i) => i.productId), key);
      const { missing } = applyPrices(draft.items, prices);
      if (missing.length > 0) {
        Alert.alert('Produto sem preço nesta tabela', `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''} não tem preço na tabela ${label(key)}. Remova o produto ou mantenha a tabela atual.`);
        return;
      }
      setDraft((d) => ({ ...d, priceTable: key, items: applyPrices(d.items, prices).items }));
      select(key);
    } catch {
      Alert.alert('Não foi possível recalcular', 'Confira a conexão e tente de novo. A tabela de preço não foi alterada.');
    } finally {
      setSwitching(false);
    }
  }

  function changeTable(key: string) {
    if (key === draft.priceTable) return;
    if (draft.items.length === 0) {
      setDraft((d) => ({ ...d, priceTable: key }));
      select(key);
      return;
    }
    Alert.alert(
      `Trocar para ${label(key)}?`,
      `Deseja recalcular os preços dos produtos já adicionados utilizando a tabela ${label(key)}? Os preços da venda são sempre calculados pelo sistema na tabela escolhida.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Recalcular preços', onPress: () => void recalculate(key) }],
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cliente: ${draft.customer?.name ?? emptyCustomer}. Alterar`}
        disabled={locked}
        onPress={() => router.push({ pathname: '/selecionar-cliente', params: { mode } })}
        style={[styles.card, styles.between]}
      >
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">
            Cliente
          </Text>
          <Text variant="label" color={draft.customer ? 'text' : mode === 'conditional' ? 'danger' : 'text'}>{draft.customer?.name ?? emptyCustomer}</Text>
        </View>
        {!locked && <Icon name="chevron-forward" size={20} color={colors.textMuted} />}
      </Pressable>

      {addProducts}

      {/* Empresa com uma tabela só: o seletor some, e o cartão vazio também. */}
      {(tables.length > 1 || mode === 'presale') && (
        <View style={styles.card}>
          <PriceTablePicker value={draft.priceTable} onChange={changeTable} disabled={locked || switching} />
          {mode === 'presale' && (
            <Text variant="caption" color="textMuted">
              Tabela: {label(draft.priceTable)} · Itens: {draft.items.length} · Total estimado: {formatCents(estimateCents(draft.items, draft.saleDiscount))}
            </Text>
          )}
        </View>
      )}

      <Text variant="heading">Itens</Text>
      {draft.items.length === 0 && <Text color="textMuted">Nenhum item. Adicione ao menos um produto.</Text>}
      {newestFirst(draft.items).map((item) => (
        <View key={item.productId} style={styles.card}>
          <View style={styles.between}>
            <View style={styles.flex}>
              <Text variant="label" numberOfLines={2}>
                {item.name}
              </Text>
              <ItemPrice
                item={item}
                editable={canChangePrice && !locked}
                onChange={(cents) => setDraft((d) => ({ ...d, items: setPrice(d.items, item.productId, cents) }))}
              />
              <Text variant="caption" color="textMuted">
                Subtotal {formatCents(estimateCents([item]))}
              </Text>
            </View>
            {!locked && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remover ${item.name}`}
                onPress={() => setDraft((d) => ({ ...d, items: removeItem(d.items, item.productId) }))}
                style={styles.remove}
              >
                <Icon name="trash-outline" size={22} color={colors.danger} />
              </Pressable>
            )}
          </View>
          {/* Quantidade e desconto lado a lado: a linha inteira cabe na tela sem rolar. */}
          <View style={styles.controls}>
            <View style={styles.control}>
              <Text variant="caption" color="textMuted">
                Quantidade
              </Text>
              <QuantityStepper
                name={item.name}
                value={item.quantity}
                integer={integerQuantity}
                disabled={locked}
                focusSignal={store.lastAdded?.productId === item.productId ? store.lastAdded.seq : undefined}
                onChange={(q) => setDraft((d) => ({ ...d, items: setQuantity(d.items, item.productId, q) }))}
              />
            </View>
            {canDiscount && (
              <View style={styles.flex}>
                <DiscountField
                  label="Desconto no item"
                  value={item.discount}
                  disabled={locked}
                  grossCents={Math.round(priceOf(item) * item.quantity)}
                  onChange={(discount) => setDraft((d) => ({ ...d, items: d.items.map((i) => (i.productId === item.productId ? { ...i, discount } : i)) }))}
                />
              </View>
            )}
          </View>
        </View>
      ))}
      {integerQuantity && <Text variant="caption" color="textMuted">No PDV a quantidade é em unidades inteiras.</Text>}
      {!locked && !addProducts && (
        <Button label="Adicionar produto" variant="outline" icon="add" onPress={() => router.push({ pathname: '/selecionar-produto', params: { mode } })} />
      )}

      <TextField
        label="Observação"
        placeholder="Opcional"
        value={draft.observation}
        onChangeText={(observation) => setDraft((d) => ({ ...d, observation: observation.slice(0, MAX_OBSERVATION) }))}
        editable={!locked}
        multiline
      />

      {canDiscount && draft.items.length > 0 && (
        <View style={styles.card}>
          {/* Separado dos itens: este vale sobre o total; o de cada item, só sobre a linha dele. */}
          <DiscountField
            label="Desconto no total da venda"
            value={draft.saleDiscount}
            disabled={locked}
            grossCents={estimateCents(draft.items)}
            onChange={(saleDiscount) => setDraft((d) => ({ ...d, saleDiscount }))}
          />
        </View>
      )}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  controls: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  control: { gap: spacing.xs },
}));
