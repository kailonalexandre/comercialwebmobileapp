import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDraft } from '@/features/presale/draft-context';
import {
  canSend,
  estimateCents,
  MAX_OBSERVATION,
  parseQuantity,
  removeItem,
  setQuantity,
  type DraftItem,
} from '@/features/presale/draft-model';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

function QuantityField({ item, disabled }: { item: DraftItem; disabled: boolean }) {
  const { setDraft } = useDraft();
  const [text, setText] = useState(String(item.quantity).replace('.', ','));

  // Cada valor válido vale na hora (o botão Enviar pode ser tocado sem o campo perder o foco);
  // ao sair do campo, texto inválido volta ao último valor bom.
  function change(next: string) {
    setText(next);
    const q = parseQuantity(next);
    if (q !== null) setDraft((d) => ({ ...d, items: setQuantity(d.items, item.productId, q) }));
  }

  function restore() {
    if (parseQuantity(text) === null) setText(String(item.quantity).replace('.', ','));
  }

  return (
    <TextField
      value={text}
      onChangeText={change}
      onBlur={restore}
      keyboardType="decimal-pad"
      editable={!disabled}
      label="Quantidade"
      style={styles.qty}
    />
  );
}

export function NewSaleScreen() {
  const { draft, phase, setDraft, send, reset } = useDraft();
  const locked = phase.name !== 'editing';

  if (phase.name === 'done') {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.doneBlock}>
          <View style={styles.doneIcon}>
            <Icon name="checkmark" size={40} color={colors.success} />
          </View>
          <Text variant="title">{phase.sale.alreadyExisted ? 'Pré-venda já registrada' : 'Pré-venda enviada'}</Text>
          <Text color="textMuted">
            Nº {phase.sale.number} · {formatCents(phase.sale.totalCents)}
          </Text>
          <Button
            label="Ver vendas"
            onPress={() => {
              reset();
              router.dismissTo('/vendas');
            }}
          />
          <Button label="Nova pré-venda" variant="outline" onPress={reset} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="title">Nova pré-venda</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Cliente: ${draft.customer?.name ?? 'Consumidor final'}. Alterar`}
          disabled={locked}
          onPress={() => router.push('/selecionar-cliente')}
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
            <QuantityField item={item} disabled={locked} />
          </View>
        ))}
        {!locked && <Button label="Adicionar produto" variant="outline" icon="add" onPress={() => router.push('/selecionar-produto')} />}

        <TextField
          label="Observação"
          placeholder="Opcional"
          value={draft.observation}
          onChangeText={(observation) => setDraft((d) => ({ ...d, observation: observation.slice(0, MAX_OBSERVATION) }))}
          editable={!locked}
          multiline
        />

        <View style={styles.card}>
          <View style={styles.between}>
            <Text variant="label">Total estimado</Text>
            <Text variant="label">{formatCents(estimateCents(draft.items))}</Text>
          </View>
          <Text variant="caption" color="textMuted">
            O total final é calculado pelo ComercialWeb, com preço, desconto e estoque atuais.
          </Text>
        </View>

        {phase.name === 'editing' && phase.error && (
          <Text color="danger" accessibilityLiveRegion="polite">
            {phase.error}
          </Text>
        )}

        {phase.name === 'uncertain' ? (
          <View style={styles.card}>
            <Text color="danger">
              Não foi possível confirmar se a pré-venda foi criada. Reenvie: se ela já existir, não será duplicada.
            </Text>
            <Button label="Reenviar" onPress={send} />
            <Button label="Descartar e começar de novo" variant="outline" onPress={reset} />
            <Text variant="caption" color="textMuted">
              Se descartar, confira em Vendas se a pré-venda anterior chegou a ser criada.
            </Text>
          </View>
        ) : (
          <Button label="Enviar pré-venda" onPress={send} loading={phase.name === 'sending'} disabled={!canSend(draft)} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  qty: { textAlign: 'right' },
  doneBlock: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
});
