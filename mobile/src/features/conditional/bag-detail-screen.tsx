import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BAG_PAYMENT_METHODS, fetchBag, finalizeBag } from '@/features/conditional/bag-api';
import { canFinalize, soldCents, validMoveQuantity, withQueued, type Bag, type BagItem } from '@/features/conditional/bag-model';
import { discardMove, queueMove, retryMove, syncBagMoves, useBagQueue } from '@/features/conditional/bag-queue';
import { formatQuantity } from '@/features/sales/sales-model';
import { DetailFrame } from '@/features/shell/detail-frame';
import { Button } from '@/shared/components/button';
import { ChipRow } from '@/shared/components/chip-row';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';
import { userMessage } from '@/shared/utils/error-message';

function ItemCard({ item, conditionalId }: { item: BagItem; conditionalId: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [qty, setQty] = useState(1);
  const amount = Math.min(qty, Math.max(item.pending, 1));
  const ok = validMoveQuantity(item, amount);

  return (
    <View style={styles.card}>
      <Text variant="label">{item.description}</Text>
      <Text variant="caption" color="textMuted">
        {formatQuantity(item.quantity)} × {formatCents(item.unitPriceCents)} · vendidas {formatQuantity(item.sold)} · devolvidas {formatQuantity(item.returned)} · com você {formatQuantity(item.pending)}
      </Text>
      {item.pending > 0 && (
        <>
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel="Diminuir" onPress={() => setQty(Math.max(1, amount - 1))} style={styles.step}>
              <Icon name="remove" size={22} color={colors.text} />
            </Pressable>
            <Text variant="label">{formatQuantity(amount)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Aumentar" onPress={() => setQty(Math.min(item.pending, amount + 1))} style={styles.step}>
              <Icon name="add" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label="Vendida" disabled={!ok} onPress={() => void queueMove(conditionalId, item.id, 'sold', amount)} />
            </View>
            <View style={styles.flex}>
              <Button label="Devolvida" variant="outline" disabled={!ok} onPress={() => void queueMove(conditionalId, item.id, 'returned', amount)} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export function BagDetailScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conditionalId = Number(id);
  const fetcher = useCallback(() => fetchBag(conditionalId), [conditionalId]);
  const { data, failure, error, reload } = useDetail(fetcher);
  const moves = useBagQueue();
  const mine = useMemo(() => moves.filter((m) => m.conditionalId === conditionalId), [moves, conditionalId]);
  // Depois que a fila esvazia o servidor é reconsultado em silêncio (sem apagar a tela); `fresh` vale mais que a carga inicial.
  const [fresh, setFresh] = useState<Bag | null>(null);
  const base = fresh ?? data;
  const bag = useMemo(() => (base ? withQueued(base, moves) : null), [base, moves]);

  // A fila esvaziou: o servidor já tem tudo, então recarrega o total que vale (é ele que o recebimento precisa fechar).
  const hadMoves = useRef(false);
  useEffect(() => {
    if (mine.length > 0) hadMoves.current = true;
    else if (hadMoves.current) {
      hadMoves.current = false;
      fetchBag(conditionalId).then(setFresh, () => {});
    }
  }, [mine.length, conditionalId]);

  const [method, setMethod] = useState('cash');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closed, setClosed] = useState<Bag | null>(null);

  const finalize = async (current: Bag) => {
    setClosing(true);
    setCloseError(null);
    try {
      const payments = current.totalCents > 0 ? [{ method, amountCents: current.totalCents }] : [];
      setClosed(await finalizeBag(current.id, payments));
    } catch (e) {
      setCloseError((e as { serverMessage?: string }).serverMessage ?? userMessage(e) ?? 'Não foi possível finalizar. Tente de novo.');
    } finally {
      setClosing(false);
    }
  };

  return (
    <DetailFrame title={bag?.number ?? 'Sacola'} loading={!bag && !failure} failure={failure} error={error} notFoundMessage="Sacola não encontrada." onRetry={reload}>
      {bag && closed && (
        <View style={styles.card}>
          <Text variant="title">Condicional finalizado</Text>
          <Text color="textMuted">Recebimento registrado no ComercialWeb: {formatCents(closed.totalCents)}.</Text>
        </View>
      )}
      {bag && !closed && (
        <>
          <View style={styles.card}>
            <Text variant="label">{bag.customerName ?? 'Consumidor final'}</Text>
            <Text variant="caption" color="textMuted">
              Vendido até agora: {formatCents(soldCents(bag))}
            </Text>
            {mine.length > 0 && (
              <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
                {mine.filter((m) => m.status !== 'error').length > 0 ? `${mine.filter((m) => m.status !== 'error').length} baixa(s) aguardando conexão. Sobem sozinhas.` : ''}
              </Text>
            )}
          </View>

          {mine.filter((m) => m.status === 'error').map((m) => (
            <View key={m.id} style={styles.card}>
              <Text color="danger">{m.error ?? 'Baixa recusada.'}</Text>
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button label="Tentar de novo" variant="outline" onPress={() => { retryMove(m.id); void syncBagMoves(); }} />
                </View>
                <View style={styles.flex}>
                  <Button label="Descartar" variant="outline" onPress={() => discardMove(m.id)} />
                </View>
              </View>
            </View>
          ))}

          {bag.items.map((item) => (
            <ItemCard key={item.id} item={item} conditionalId={bag.id} />
          ))}

          {canFinalize(bag, mine) && (
            <View style={styles.card}>
              <Text variant="heading">Finalizar</Text>
              <Text color="textMuted">Total a receber: {formatCents(bag.totalCents)}</Text>
              {bag.totalCents > 0 && <ChipRow options={BAG_PAYMENT_METHODS} selected={method} onSelect={setMethod} />}
              {closeError && <Text color="danger" accessibilityLiveRegion="polite">{closeError}</Text>}
              <Button label={bag.totalCents > 0 ? 'Receber e finalizar' : 'Finalizar'} loading={closing} onPress={() => void finalize(bag)} />
            </View>
          )}
        </>
      )}
    </DetailFrame>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  flex: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  step: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page },
  actions: { flexDirection: 'row', gap: spacing.sm },
}));
