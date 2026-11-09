import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { fetchOpenBags } from '@/features/conditional/bag-api';
import { pendingTotal, withQueued } from '@/features/conditional/bag-model';
import { useBagQueue } from '@/features/conditional/bag-queue';
import { DetailFrame } from '@/features/shell/detail-frame';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { spacing } from '@/shared/theme/tokens';
import { formatQuantity } from '@/features/sales/sales-model';

// Minhas sacolas: condicionais abertos que saíram com o vendedor, com o que ainda falta dar baixa.
export function BagListScreen() {
  const { data, failure, error, reload } = useDetail(fetchOpenBags);
  const moves = useBagQueue();
  const bags = useMemo(() => data?.map((b) => withQueued(b, moves)), [data, moves]);

  return (
    <DetailFrame title="Minhas sacolas" loading={!data && !failure} failure={failure} error={error} notFoundMessage="Nenhuma sacola." onRetry={reload}>
      {bags?.length === 0 && <Text color="textMuted">Nenhuma sacola aberta. Crie um condicional para sair com as peças.</Text>}
      <View style={{ gap: spacing.sm }}>
        {bags?.map((bag) => {
          const left = pendingTotal(bag);
          return (
            <ListRow
              key={bag.id}
              title={bag.customerName ?? 'Consumidor final'}
              lines={[`${bag.number} · ${left > 0 ? `${formatQuantity(left)} peça(s) com você` : 'tudo baixado'}`]}
              onPress={() => router.push({ pathname: '/condicional/[id]', params: { id: String(bag.id) } })}
              trailing={<StatusPill label={left > 0 ? 'Na rua' : 'Pronta p/ fechar'} tone={left > 0 ? 'warning' : 'success'} />}
            />
          );
        })}
      </View>
    </DetailFrame>
  );
}
