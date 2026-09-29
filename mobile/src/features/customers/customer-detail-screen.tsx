import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { fetchCustomer, formatAddress } from '@/features/customers/customers-api';
import { DetailFrame } from '@/features/shell/detail-frame';
import { InfoCard } from '@/shared/components/info-card';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';

export function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetcher = useCallback(() => fetchCustomer(Number(id)), [id]);
  const { data: c, failure, error, reload } = useDetail(fetcher);

  return (
    <DetailFrame title="Cliente" loading={!c && !failure} failure={failure} error={error} notFoundMessage="Cliente não encontrado." onRetry={reload}>
      {c && (
        <>
          <View style={{ gap: 4 }}>
            <Text variant="title">{c.name}</Text>
            {c.tradeName && <Text color="textMuted">{c.tradeName}</Text>}
            {c.restrictionBlock ? (
              <StatusPill label="Bloqueado" tone="danger" />
            ) : c.restrictionAlert ? (
              <StatusPill label="Com restrição" tone="primary" />
            ) : !c.isActive ? (
              <StatusPill label="Inativo" tone="danger" />
            ) : null}
          </View>
          <InfoCard
            rows={[
              { label: c.personKind === 'company' ? 'CNPJ' : 'CPF', value: c.document },
              { label: 'Telefone', value: c.phone },
              { label: 'Celular', value: c.mobile },
              { label: 'WhatsApp', value: c.whatsapp },
              { label: 'E-mail', value: c.email },
              { label: 'Endereço', value: formatAddress(c.mainAddress) },
              { label: 'Código', value: String(c.code) },
            ]}
          />
        </>
      )}
    </DetailFrame>
  );
}
