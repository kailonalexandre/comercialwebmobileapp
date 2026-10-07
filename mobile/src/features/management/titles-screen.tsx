import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { fetchTitles } from '@/features/management/management-api';
import { formatDate, installmentLabel, TITLE_NAME, titleStatus, type Title, type TitleKind, type TitleStatusFilter } from '@/features/management/management-model';
import { ListScreen } from '@/features/shell/list-screen';
import { ChipRow } from '@/shared/components/chip-row';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { formatCents } from '@/shared/utils/format';

const FILTERS: { key: TitleStatusFilter; label: string }[] = [
  { key: 'open', label: 'Em aberto' },
  { key: 'overdue', label: 'Vencidos' },
  { key: 'paid', label: 'Baixados' },
  { key: 'all', label: 'Todos' },
];

function TitleRow({ title: t }: { title: Title }) {
  const status = titleStatus(t);
  const lines = [t.personName, `Vence ${formatDate(t.dueDate)}`, installmentLabel(t)].filter((v): v is string => !!v);
  const name = t.description ?? t.document ?? `Título ${t.id}`;
  return (
    <ListRow
      title={name}
      lines={lines}
      label={`${name}, ${formatCents(t.status === 'settled' ? t.amountCents : t.openCents)}, ${status.label}`}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
          <Text variant="label">{formatCents(t.status === 'settled' ? t.amountCents : t.openCents)}</Text>
          <StatusPill label={status.label} tone={status.tone} />
        </View>
      }
    />
  );
}

// Contas a receber / a pagar: consulta (a baixa e os lançamentos continuam no ComercialWeb).
export function TitlesScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const kind: TitleKind = type === 'payable' ? 'payable' : 'receivable';
  const [filter, setFilter] = useState<TitleStatusFilter>('open');
  const fetchPage = useCallback((page: number, search: string) => fetchTitles(kind, page, search, filter), [kind, filter]);
  return (
    <ListScreen
      // `key`: outro filtro ou tipo recomeça a lista na página 1.
      key={`${kind}-${filter}`}
      title={TITLE_NAME[kind]}
      searchPlaceholder="Descrição, documento ou cliente/fornecedor"
      emptyMessage="Nenhum título encontrado."
      fetchPage={fetchPage}
      keyOf={(t) => String(t.id)}
      renderRow={(t) => <TitleRow title={t} />}
      onBack={() => router.back()}
      filters={<ChipRow options={FILTERS} selected={filter} onSelect={setFilter} />}
    />
  );
}
