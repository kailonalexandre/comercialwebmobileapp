import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DraftEditor } from '@/features/presale/draft-editor';
import { canSend, estimateCents } from '@/features/presale/draft-model';
import { usePreSaleDraft } from '@/features/presale/presale-draft';
import { ReceiptActions } from '@/features/sales/receipt-actions';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

export function NewSaleScreen() {
  const store = usePreSaleDraft();
  const { draft, phase, send, reset } = store;
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
          <ReceiptActions saleId={phase.sale.saleId} />
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
        <DraftEditor store={store} mode="presale" locked={locked} />

        <View style={styles.card}>
          <View style={styles.between}>
            <Text variant="label">Total estimado</Text>
            <Text variant="label">{formatCents(estimateCents(draft.items, draft.saleDiscount))}</Text>
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
  root: { flex: 1, backgroundColor: colors.page },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  doneBlock: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
});
