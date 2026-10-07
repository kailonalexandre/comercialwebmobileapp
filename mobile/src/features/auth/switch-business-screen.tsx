import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchBusinesses, type BusinessOption } from '@/features/auth/auth-api';
import { useSession } from '@/features/auth/session-context';
import { useQuickCustomerQueue } from '@/features/customers/quick-customer-queue';
import { useSaleQueue } from '@/features/sales/sale-queue';
import { Icon } from '@/shared/components/icon';
import { ListRow } from '@/shared/components/list-row';
import { StateView } from '@/shared/components/state-view';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { userMessage } from '@/shared/utils/error-message';
import { layout, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

// Trocar a empresa ativa sem sair da conta. A API confere o vínculo; tudo que está em memória é recriado e o que está
// guardado no aparelho (cópias, filas) é separado por empresa.
export function SwitchBusinessScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { switchBusiness, profile } = useSession();
  const { data, failure, error, reload } = useDetail(fetchBusinesses);
  const [switching, setSwitching] = useState<number | null>(null);
  const sales = useSaleQueue();
  const customers = useQuickCustomerQueue();

  const pendingOf = (id: number) =>
    sales.filter((e) => e.businessId === id && e.status !== 'synced').length + customers.filter((e) => e.businessId === id && e.status !== 'synced').length;

  async function choose(option: BusinessOption) {
    setSwitching(option.id);
    try {
      await switchBusiness(option.id);
      router.replace('/'); // tudo foi recriado; começa pelo Início da nova empresa
    } catch (e) {
      Alert.alert('Não foi possível trocar de empresa', userMessage(e) ?? 'Confira a conexão e tente de novo. A empresa atual continua ativa.');
    } finally {
      setSwitching(null);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="title">Trocar empresa</Text>
      </View>
      {failure ? (
        <StateView kind="error" message={userMessage(error) ?? 'Não foi possível carregar as empresas.'} onRetry={reload} />
      ) : !data ? (
        <StateView kind="loading" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {data.businesses.map((b) => {
            const current = b.id === (profile?.businessId ?? data.currentBusinessId);
            const pending = pendingOf(b.id);
            return (
              <ListRow
                key={b.id}
                title={b.name}
                lines={pending > 0 ? [`${pending} ${pending === 1 ? 'item guardado' : 'itens guardados'} aguardando sincronização`] : []}
                label={`${b.name}${current ? ', empresa ativa' : ''}`}
                onPress={current || switching !== null ? undefined : () => void choose(b)}
                trailing={current ? <StatusPill label="Ativa" tone="success" /> : switching === b.id ? <Text variant="caption" color="textMuted">Trocando…</Text> : undefined}
              />
            );
          })}
          {data.businesses.length < 2 && <Text color="textMuted">Sua conta tem acesso a uma única empresa.</Text>}
          <Text variant="caption" color="textMuted">
            Vendas, clientes, produtos, estoque e tabelas de preço passam a ser os da empresa escolhida. O que ficou guardado offline continua na empresa de origem e só é enviado a ela.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.sm },
}));
