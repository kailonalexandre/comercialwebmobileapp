import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPaymentMethods, type PaymentMethod } from '@/features/pdv/pdv-api';
import { usePdvDraft } from '@/features/pdv/pdv-draft';
import { usePdvQuote } from '@/features/pdv/use-pdv-quote';
import { DraftEditor } from '@/features/presale/draft-editor';
import { addPayment, changeCents, paidCents, parseMoney, remainingCents, removePayment } from '@/features/presale/draft-model';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

export function PdvScreen() {
  const store = usePdvDraft();
  const { draft, phase, setDraft, send, reset } = store;
  const locked = phase.name !== 'editing';
  const quote = usePdvQuote(draft, phase.name === 'editing');
  const total = quote.quote?.totalCents ?? null;

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    let active = true;
    fetchPaymentMethods()
      .then((list) => {
        if (!active) return;
        setMethods(list);
        setMethod((current) => current ?? list[0]?.code ?? null);
      })
      .catch(() => undefined); // sem formas, o operador vê a mensagem abaixo e pode tentar de novo ao reabrir
    return () => {
      active = false;
    };
  }, []);

  const remaining = total === null ? null : remainingCents(total, draft.payments);
  const change = total === null ? 0 : changeCents(total, draft.payments);
  const parsed = parseMoney(amount);
  const canFinalize = total !== null && draft.items.length > 0 && draft.payments.length > 0 && remaining === 0;

  function addAmount(cents: number | null) {
    const chosen = methods.find((m) => m.code === method);
    if (!chosen || cents === null) return;
    setDraft((d) => ({ ...d, payments: addPayment(d.payments, { method: chosen.code, label: chosen.name, amountCents: cents }) }));
    setAmount('');
  }

  if (phase.name === 'done') {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.doneBlock}>
          <View style={styles.doneIcon}>
            <Icon name="checkmark" size={40} color={colors.success} />
          </View>
          <Text variant="title">{phase.sale.alreadyExisted ? 'Venda já registrada' : 'Venda finalizada'}</Text>
          <Text color="textMuted">
            Nº {phase.sale.number} · {formatCents(phase.sale.totalCents)}
          </Text>
          {(phase.sale.changeCents ?? 0) > 0 && (
            <Text variant="heading" color="success">
              Troco: {formatCents(phase.sale.changeCents ?? 0)}
            </Text>
          )}
          <Button label="Nova venda" onPress={reset} />
          <Button
            label="Ver vendas"
            variant="outline"
            onPress={() => {
              reset();
              router.navigate('/vendas');
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title">PDV</Text>

        <DraftEditor store={store} mode="pdv" locked={locked} integerQuantity />

        <View style={styles.card}>
          <View style={styles.between}>
            <Text variant="label">Total</Text>
            <Text variant="heading">{quote.status === 'loading' && total === null ? 'Calculando…' : total === null ? '—' : formatCents(total)}</Text>
          </View>
          {quote.error && (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
              {quote.error}
              {quote.registerClosed ? ' Depois de abrir o caixa, volte a esta tela.' : ''}
            </Text>
          )}
          <Text variant="caption" color="textMuted">
            Preços e estoque conferidos no ComercialWeb.
          </Text>
        </View>

        <Text variant="heading">Recebimento</Text>
        <View style={styles.card}>
          {methods.length === 0 && <Text color="textMuted">Formas de pagamento indisponíveis no momento.</Text>}
          <View style={styles.chips}>
            {methods.map((m) => (
              <Pressable
                key={m.code}
                accessibilityRole="button"
                accessibilityState={{ selected: method === m.code, disabled: locked }}
                disabled={locked}
                onPress={() => setMethod(m.code)}
                style={[styles.chip, method === m.code && styles.chipActive]}
              >
                <Text variant="label" color={method === m.code ? 'primary' : 'textMuted'}>
                  {m.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextField
            label="Valor recebido"
            placeholder="0,00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={!locked}
            onSubmitEditing={() => addAmount(parsed)}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Adicionar" variant="outline" onPress={() => addAmount(parsed)} disabled={locked || parsed === null || !method} />
            </View>
            <View style={styles.flex}>
              <Button
                label={remaining ? `Restante ${formatCents(remaining)}` : 'Restante'}
                variant="outline"
                onPress={() => addAmount(remaining)}
                disabled={locked || !remaining || !method}
              />
            </View>
          </View>
          {draft.payments.map((p) => (
            <View key={p.method} style={styles.between}>
              <Text>{p.label}</Text>
              <View style={styles.row}>
                <Text variant="label">{formatCents(p.amountCents)}</Text>
                {!locked && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${p.label}`}
                    onPress={() => setDraft((d) => ({ ...d, payments: removePayment(d.payments, p.method) }))}
                  >
                    <Icon name="close-circle-outline" size={24} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          {draft.payments.length > 0 && total !== null && (
            <View style={styles.between}>
              <Text color="textMuted">Recebido {formatCents(paidCents(draft.payments))}</Text>
              {remaining ? (
                <Text variant="label" color="danger">
                  Falta {formatCents(remaining)}
                </Text>
              ) : (
                <Text variant="label" color="success">
                  {change > 0 ? `Troco ${formatCents(change)}` : 'Pago'}
                </Text>
              )}
            </View>
          )}
        </View>

        {phase.name === 'editing' && phase.error && (
          <Text color="danger" accessibilityLiveRegion="polite">
            {phase.error}
          </Text>
        )}

        {phase.name === 'uncertain' ? (
          <View style={styles.card}>
            <Text color="danger">Não foi possível confirmar se a venda foi registrada. Reenvie: se ela já existir, não será duplicada.</Text>
            <Button label="Reenviar" onPress={send} />
            <Button label="Descartar e começar de novo" variant="outline" onPress={reset} />
            <Text variant="caption" color="textMuted">
              Se descartar, confira em Vendas se a venda anterior chegou a ser registrada.
            </Text>
          </View>
        ) : (
          <Button label="Finalizar venda" onPress={send} loading={phase.name === 'sending'} disabled={!canFinalize} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 3 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  doneBlock: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
});
