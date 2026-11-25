import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DraftEditor } from '@/features/presale/draft-editor';
import { canSend, estimateCents, newestFirst } from '@/features/presale/draft-model';
import { usePreSaleDraft } from '@/features/presale/presale-draft';
import { ReceiptActions } from '@/features/sales/receipt-actions';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { OrderChip, OrderFooter, OrderHeader } from '@/shared/components/order-ui';
import { Text } from '@/shared/components/text';
import { layout, radius, spacing } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents, formatMilli } from '@/shared/utils/format';

const TYPES = ['BOLETO BANCÁRIO', 'CARTÃO DE DÉBITO', 'CARTEIRA', 'CARTÃO DE CRÉDITO', 'CHEQUE', 'DINHEIRO', 'DUPLICATA'];
const TERMS = ['15 DIAS', '30 DIAS', '7 DIAS', 'À VISTA', 'ENT/30 DIAS', 'ENT/30/60 DIAS', 'ENT/30/60/90 DIAS'];

export function NewSaleScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const store = usePreSaleDraft();
  const [review, setReview] = useState(false);
  const { draft, phase, send, setDraft } = store;
  const reset = () => {
    setReview(false);
    store.reset();
  };
  const total = formatCents(estimateCents(draft.items, draft.saleDiscount));
  const payment = draft.orderPayment;
  const error = phase.name === 'editing' && phase.error
    ? <Text color="danger" accessibilityLiveRegion="polite">{phase.error}</Text>
    : null;
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
          <Button label="Novo pedido" variant="outline" onPress={reset} />
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
          <Text variant="title">Pré-venda guardada</Text>
          <Text color="textMuted">Sem confirmação do servidor. A pré-venda está guardada neste aparelho e será enviada sozinha quando a conexão voltar, sem duplicar.</Text>
          <Text variant="caption" color="textMuted">Acompanhe em Vendas, em “Aguardando sincronização”.</Text>
          <Button label="Novo pedido" onPress={reset} />
          <Button
            label="Ver vendas"
            variant="outline"
            onPress={() => {
              reset();
              router.dismissTo('/vendas');
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <OrderHeader title="Novo pedido" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <DraftEditor store={store} mode="presale" locked={locked}
          addProducts={
            <Pressable accessibilityRole="button" accessibilityLabel="Buscar produto" disabled={locked}
              onPress={() => router.push({ pathname: '/selecionar-produto', params: { mode: 'presale' } })} style={styles.search}>
              <Icon name="search-outline" size={22} color={colors.textMuted} />
              <Text color="textMuted" style={styles.flex}>Buscar produto</Text>
              <View style={styles.searchAdd}><Icon name="add" size={24} color={colors.onPrimary} /></View>
            </Pressable>
          }
          payment={
            <View style={styles.payment}>
              <Text variant="heading" style={styles.paymentTitle}>Pagamento</Text>
              <Text variant="caption" color="textMuted">Tipo de pagamento</Text>
              <View style={styles.chips}>
                {TYPES.map((type) => <OrderChip key={type} label={type} selected={payment?.type === type} disabled={locked}
                  onPress={() => setDraft((d) => ({ ...d, orderPayment: { ...d.orderPayment, type } }))} />)}
              </View>
              <Text variant="caption" color="textMuted">Forma de pagamento</Text>
              <View style={styles.chips}>
                {TERMS.map((term) => <OrderChip key={term} label={term} selected={payment?.term === term} disabled={locked}
                  onPress={() => setDraft((d) => ({ ...d, orderPayment: { type: d.orderPayment?.type ?? 'DINHEIRO', term: d.orderPayment?.term === term ? undefined : term } }))} />)}
              </View>
            </View>
          }
        />
        {error}
      </ScrollView>

      <OrderFooter>
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">Total</Text>
          <Text variant="total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{total}</Text>
        </View>
        <Button label="Revisar pedido" trailingIcon="arrow-forward" disabled={!canSend(draft) || locked}
          onPress={() => { Keyboard.dismiss(); setReview(true); }} />
      </OrderFooter>

      <Modal visible={review} onRequestClose={() => { if (!locked) setReview(false); }} animationType="slide" statusBarTranslucent navigationBarTranslucent>
        <SafeAreaView edges={['top']} style={styles.root}>
          <OrderHeader title="Revisar pedido" onBack={locked ? undefined : () => setReview(false)} />
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.reviewCard}>
              <Text variant="caption" color="textMuted">Cliente</Text>
              <Text variant="label">{draft.customer?.name ?? 'Consumidor final'}</Text>
            </View>
            <View style={styles.reviewCard}>
              <Text variant="heading">Carrinho</Text>
              {newestFirst(draft.items).map((item) => (
                <View key={item.productId} style={styles.reviewRow}>
                  <Text style={styles.flex}>{formatMilli(Math.round(item.quantity * 1000))} × {item.name}</Text>
                  <Text variant="label">{formatCents(estimateCents([item]))}</Text>
                </View>
              ))}
              {draft.saleDiscount && (
                <View style={styles.reviewRow}>
                  <Text color="textMuted" style={styles.flex}>Desconto no total</Text>
                  <Text variant="label">− {formatCents(estimateCents(draft.items) - estimateCents(draft.items, draft.saleDiscount))}</Text>
                </View>
              )}
            </View>
            {payment && <View style={styles.reviewCard}>
              <Text variant="label">Pagamento previsto</Text>
              <Text color="textMuted">{[payment.type, payment.term].filter(Boolean).join(' · ')}</Text>
              <Text variant="caption" color="textMuted">A preferência é enviada na observação para o fechamento da pré-venda.</Text>
            </View>}
            {!!draft.observation.trim() && <View style={styles.reviewCard}>
              <Text variant="label">Observação</Text>
              <Text color="textMuted">{draft.observation.trim()}</Text>
            </View>}
            {error}
          </ScrollView>
          <OrderFooter>
            <View style={styles.flex}>
              <Text variant="caption" color="textMuted">Total</Text>
              <Text variant="total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{total}</Text>
            </View>
            <Button label="Enviar pedido" icon="checkmark" onPress={send} loading={phase.name === 'sending'} disabled={!canSend(draft)} />
          </OrderFooter>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  content: { ...layout.content, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  search: { backgroundColor: colors.background, borderColor: colors.primary, borderWidth: 1.5, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm, gap: spacing.md, minHeight: 56 },
  searchAdd: { backgroundColor: colors.primary, height: 40, width: 40, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  paymentTitle: { fontSize: 18 },
  payment: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.xs },
  reviewCard: { backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  doneBlock: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
}));
