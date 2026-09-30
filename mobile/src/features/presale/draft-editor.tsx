import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DraftValue } from '@/features/presale/draft-context';
import { DiscountField } from '@/features/presale/discount-field';
import { MAX_OBSERVATION, parseQuantity, removeItem, setQuantity, type DraftItem } from '@/features/presale/draft-model';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

export type DraftMode = 'presale' | 'pdv';

function QuantityField({ item, disabled, store, integer }: { item: DraftItem; disabled: boolean; store: DraftValue; integer: boolean }) {
  const [text, setText] = useState(String(item.quantity).replace('.', ','));

  // Cada valor válido vale na hora (o botão de envio pode ser tocado sem o campo perder o foco);
  // ao sair do campo, texto inválido volta ao último valor bom.
  function change(next: string) {
    setText(next);
    const q = parseQuantity(next);
    if (q !== null && (!integer || Number.isInteger(q))) store.setDraft((d) => ({ ...d, items: setQuantity(d.items, item.productId, q) }));
  }

  function restore() {
    const q = parseQuantity(text);
    if (q === null || (integer && !Number.isInteger(q))) setText(String(item.quantity).replace('.', ','));
  }

  return (
    <TextField
      value={text}
      onChangeText={change}
      onBlur={restore}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      editable={!disabled}
      label="Quantidade"
      style={styles.qty}
    />
  );
}

// Cliente, itens e observação: igual na pré-venda e no PDV. `mode` diz a qual rascunho os seletores devem responder.
export function DraftEditor({ store, mode, locked, integerQuantity = false, canDiscount = true }: { store: DraftValue; mode: DraftMode; locked: boolean; integerQuantity?: boolean; canDiscount?: boolean }) {
  const { draft, setDraft } = store;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cliente: ${draft.customer?.name ?? 'Consumidor final'}. Alterar`}
        disabled={locked}
        onPress={() => router.push({ pathname: '/selecionar-cliente', params: { mode } })}
        style={[styles.card, styles.between]}
      >
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">
            Cliente
          </Text>
          <Text variant="label">{draft.customer?.name ?? 'Consumidor final'}</Text>
        </View>
        {!locked && <Icon name="chevron-forward" size={20} color={colors.textMuted} />}
      </Pressable>

      <Text variant="heading">Itens</Text>
      {draft.items.length === 0 && <Text color="textMuted">Nenhum item. Adicione ao menos um produto.</Text>}
      {draft.items.map((item) => (
        <View key={item.productId} style={styles.card}>
          <View style={styles.between}>
            <View style={styles.flex}>
              <Text variant="label">{item.name}</Text>
              <Text variant="caption" color="textMuted">
                {formatCents(item.unitPriceCents)} cada
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
          <QuantityField item={item} disabled={locked} store={store} integer={integerQuantity} />
          {canDiscount && (
            <DiscountField
              label="Desconto no produto"
              value={item.discount}
              disabled={locked}
              onChange={(discount) => setDraft((d) => ({ ...d, items: d.items.map((i) => (i.productId === item.productId ? { ...i, discount } : i)) }))}
            />
          )}
        </View>
      ))}
      {integerQuantity && <Text variant="caption" color="textMuted">No PDV a quantidade é em unidades inteiras.</Text>}
      {!locked && (
        <Button label="Adicionar produto" variant="outline" icon="add" onPress={() => router.push({ pathname: '/selecionar-produto', params: { mode } })} />
      )}

      {canDiscount && draft.items.length > 0 && (
        <View style={styles.card}>
          <DiscountField label="Desconto na venda" value={draft.saleDiscount} disabled={locked} onChange={(saleDiscount) => setDraft((d) => ({ ...d, saleDiscount }))} />
        </View>
      )}

      <TextField
        label="Observação"
        placeholder="Opcional"
        value={draft.observation}
        onChangeText={(observation) => setDraft((d) => ({ ...d, observation: observation.slice(0, MAX_OBSERVATION) }))}
        editable={!locked}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  qty: { textAlign: 'right' },
});
