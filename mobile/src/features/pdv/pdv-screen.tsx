import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPaymentMethods, type PaymentMethod } from '@/features/pdv/pdv-api';
import { useSession } from '@/features/auth/session-context';
import { usePdvDraft } from '@/features/pdv/pdv-draft';
import { usePdvQuote } from '@/features/pdv/use-pdv-quote';
import { DraftEditor } from '@/features/presale/draft-editor';
import { PaymentSheet } from '@/features/pdv/payment-sheet';
import { ReceiptActions } from '@/features/sales/receipt-actions';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { layout, radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

export function PdvScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const store = usePdvDraft();
  const { profile } = useSession();
  // Só esconde o campo; o ComercialWeb confere pdv.discount em cada venda.
  const canDiscount = profile?.permissions.includes('pdv.discount') ?? false;
  const canChangePrice = profile?.permissions.includes('pdv.change-price') ?? false;
  const { draft, phase, reset } = store;
  const locked = phase.name !== 'editing';
  const quote = usePdvQuote(draft, phase.name === 'editing');
  const total = quote.quote?.totalCents ?? null;

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  // Modal de recebimento. Fecha sozinho quando a venda termina (a tela de "venda finalizada" assume).
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    let active = true;
    fetchPaymentMethods()
      .then((list) => active && setMethods(list))
      .catch(() => undefined); // sem formas, o modal avisa e o operador tenta de novo ao reabrir
    return () => {
      active = false;
    };
  }, []);

  // Venda concluída (ou guardada na fila): a próxima começa com o modal fechado.
  const next = () => {
    setCharging(false);
    reset();
  };

  const count = draft.items.length;
  const canCharge = total !== null && count > 0 && !locked;
  const addProducts = () => router.push({ pathname: '/selecionar-produto', params: { mode: 'pdv' } });

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
          <ReceiptActions saleId={phase.sale.saleId} />
          <Button label="Nova venda" onPress={next} />
          <Button
            label="Ver vendas"
            variant="outline"
            onPress={() => {
              next();
              router.navigate('/vendas');
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (phase.name === 'queued') {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.doneBlock}>
          <View style={styles.doneIcon}>
            <Icon name="cloud-offline-outline" size={40} color={colors.primary} />
          </View>
          <Text variant="title">Venda guardada</Text>
          <Text color="textMuted">Sem confirmação do servidor. A venda está guardada neste aparelho e será enviada sozinha quando a conexão voltar, sem duplicar.</Text>
          <Text variant="caption" color="textMuted">Acompanhe em Vendas, em “Aguardando sincronização”.</Text>
          <Button label="Nova venda" onPress={next} />
          <Button
            label="Ver vendas"
            variant="outline"
            onPress={() => {
              next();
              router.navigate('/vendas');
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Logo abaixo do cliente: o primeiro passo da venda, sempre no mesmo lugar; a bolinha mostra quantos itens já entraram.
  const productsButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Adicionar produtos. ${count} ${count === 1 ? 'item' : 'itens'} na venda`}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={addProducts}
      style={({ pressed }) => [styles.add, pressed && styles.pressed, locked && styles.inactive]}
    >
      <Icon name="add" size={22} color={colors.primary} />
      <Text variant="label" color="primary">
        Produtos
      </Text>
      {count > 0 && (
        <View style={styles.badge} importantForAccessibility="no-hide-descendants">
          <Text variant="monoSmall" color="onPrimary">
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="title">PDV</Text>

          <DraftEditor store={store} mode="pdv" locked={locked} integerQuantity canDiscount={canDiscount} canChangePrice={canChangePrice} addProducts={productsButton} />

          <View style={styles.card}>
            {(quote.quote?.discountCents ?? 0) > 0 && (
              <View style={styles.between}>
                <Text color="textMuted">Descontos</Text>
                <Text color="textMuted">- {formatCents(quote.quote?.discountCents ?? 0)}</Text>
              </View>
            )}
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
            <Text variant="caption" color={quote.offline ? 'danger' : 'textMuted'}>
              {quote.offline
                ? 'Sem conexão: total estimado. A venda fica guardada no aparelho e o ComercialWeb confere preços e estoque ao sincronizar.'
                : 'Preços e estoque conferidos no ComercialWeb.'}
            </Text>
          </View>
        </ScrollView>

        {/* Rodapé ao alcance do polegar: total, adicionar produtos (com a contagem) e cobrar. */}
        <View style={styles.footer}>
          <View style={styles.between}>
            <Text variant="caption" color="textMuted">
              Total · {count} {count === 1 ? 'item' : 'itens'}
            </Text>
            <Text variant="total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {total === null ? '—' : formatCents(total)}
            </Text>
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Cobrar" icon="cash-outline" onPress={() => setCharging(true)} loading={phase.name === 'sending'} disabled={!canCharge} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {total !== null && (
        <PaymentSheet
          visible={charging && (phase.name === 'editing' || phase.name === 'sending')}
          onClose={() => setCharging(false)}
          store={store}
          totalCents={total}
          offline={quote.offline ?? false}
          methods={methods}
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  // Folga embaixo: o botão central (PDV) da barra de abas sobe por cima do rodapé.
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  add: {
    minHeight: touchTarget + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pressed: { opacity: 0.7 },
  inactive: { opacity: 0.4 },
  badge: {
    position: 'absolute',
    top: -spacing.sm,
    right: -spacing.sm,
    minWidth: 22,
    height: 22,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBlock: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
}));
