import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PaymentMethod } from '@/features/pdv/pdv-api';
import type { DraftValue } from '@/features/presale/draft-context';
import { addPayment, changeCents, paidCents, parseMoney, remainingCents, removePayment } from '@/features/presale/draft-model';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

type Props = {
  visible: boolean;
  onClose: () => void;
  store: DraftValue;
  // Total cotado pelo ComercialWeb (ou estimado sem conexão): o recebimento é conferido contra ele.
  totalCents: number;
  offline: boolean;
  methods: PaymentMethod[];
};

/**
 * Recebimento do PDV num modal: mesmas formas, valores, troco e envio de antes, só fora da tela principal. Os valores
 * recebidos ficam no rascunho da venda, então fechar sem confirmar não perde nada. Confirmar usa o `send` do rascunho
 * (fila local + Idempotency-Key, trava contra toque duplo).
 */
export function PaymentSheet({ visible, onClose, store, totalCents, offline, methods }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { draft, phase, setDraft, send } = store;
  const sending = phase.name === 'sending';
  const [chosen, setChosen] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const method = methods.find((m) => m.code === chosen) ?? methods[0];

  const remaining = remainingCents(totalCents, draft.payments);
  const change = changeCents(totalCents, draft.payments);
  const parsed = parseMoney(amount);
  const canConfirm = draft.items.length > 0 && draft.payments.length > 0 && remaining === 0 && !sending;
  const close = () => !sending && onClose();

  function receive(cents: number | null) {
    if (!method || cents === null) return;
    setDraft((d) => ({ ...d, payments: addPayment(d.payments, { method: method.code, label: method.name, amountCents: cents }) }));
    setAmount('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Fechar recebimento" style={styles.dismiss} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          <View style={styles.header}>
            <Text variant="heading">Recebimento</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" disabled={sending} onPress={close} style={styles.iconButton}>
              <Icon name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.between}>
              <Text color="textMuted">Total da venda</Text>
              <Text variant="total">{formatCents(totalCents)}</Text>
            </View>
            {offline && (
              <Text variant="caption" color="danger">
                Sem conexão: total estimado. A venda fica guardada e o ComercialWeb confere ao sincronizar.
              </Text>
            )}

            {methods.length === 0 && <Text color="textMuted">Formas de pagamento indisponíveis no momento.</Text>}
            <View style={styles.chips}>
              {methods.map((m) => {
                const active = method?.code === m.code;
                return (
                  <Pressable
                    key={m.code}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: sending }}
                    disabled={sending}
                    onPress={() => setChosen(m.code)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text variant="label" color={active ? 'primary' : 'textMuted'}>
                      {m.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label="Valor recebido"
              placeholder="0,00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!sending}
              onSubmitEditing={() => receive(parsed)}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Adicionar" variant="outline" onPress={() => receive(parsed)} disabled={sending || parsed === null || !method} />
              </View>
              <View style={styles.flex}>
                <Button
                  label={remaining ? `Restante ${formatCents(remaining)}` : 'Restante'}
                  variant="outline"
                  onPress={() => receive(remaining)}
                  disabled={sending || !remaining || !method}
                />
              </View>
            </View>

            {draft.payments.map((p) => (
              <View key={p.method} style={styles.between}>
                <Text>{p.label}</Text>
                <View style={styles.row}>
                  <Text variant="label">{formatCents(p.amountCents)}</Text>
                  {!sending && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remover ${p.label}`}
                      onPress={() => setDraft((d) => ({ ...d, payments: removePayment(d.payments, p.method) }))}
                      style={styles.iconButton}
                    >
                      <Icon name="close-circle-outline" size={24} color={colors.danger} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
            {draft.payments.length > 0 && (
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

            {phase.name === 'editing' && phase.error && (
              <Text color="danger" accessibilityLiveRegion="polite">
                {phase.error}
              </Text>
            )}
          </ScrollView>
          <Button label="Confirmar recebimento" icon="checkmark" onPress={() => void send()} loading={sending} disabled={!canConfirm} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.background,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  content: { gap: spacing.md, paddingBottom: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
}));
