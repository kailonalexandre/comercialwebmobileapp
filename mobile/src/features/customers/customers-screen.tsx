import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { ListScreen } from '@/features/shell/list-screen';
import { OrderNavigation } from '@/features/shell/order-navigation';
import { digits, maskDocument } from '@/features/customers/quick-customer-model';
import { fetchCustomers, type Customer } from '@/features/customers/customers-api';
import { useSession } from '@/features/auth/session-context';
import { PendingCustomers } from '@/features/customers/pending-customers';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';
import { StatusPill } from '@/shared/components/status-pill';

// "+ Novo" das listas de clientes (Clientes e escolha do cliente na venda). Só com people.create; a API confere de novo.
export function NewCustomerButton({ mode }: { mode?: string }) {
  const { profile } = useSession();
  const { colors } = useTheme();
  const styles = useStyles();
  if (!profile?.permissions.includes('people.create')) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Novo cliente" onPress={() => router.push({ pathname: '/cliente-novo', params: mode ? { mode } : {} })} style={styles.newButton}>
      <Icon name="person-add-outline" size={20} color={colors.onPrimary} />
      <Text variant="label" color="onPrimary">
        Novo
      </Text>
    </Pressable>
  );
}

export function CustomerRow({ customer, onPress, trailing }: { customer: Customer; onPress?: () => void; trailing?: ReactElement }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const doc = customer.document ?? '';
  const length = digits(doc).length;
  const document = length === 11 || length === 14 ? maskDocument(doc, length === 14 ? 'company' : 'individual') : doc;

  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={styles.row}>
      <View style={styles.customer}>
        <Text variant="label" numberOfLines={2}>{customer.name}</Text>
        <Text variant="caption" color="textMuted">{[`Cód. ${customer.code}`, document].filter(Boolean).join(' · ')}</Text>
      </View>
      {trailing}
      {onPress && <Icon name="chevron-forward" size={19} color={colors.textMuted} />}
    </Pressable>
  );
}

export function CustomersScreen() {
  return (
    <ListScreen
      orderLayout
      header={<PendingCustomers />}
      action={<NewCustomerButton />}
      title="Clientes"
      searchPlaceholder="Buscar por nome, CNPJ/CPF ou código"
      emptyMessage="Nenhum cliente encontrado."
      fetchPage={fetchCustomers}
      keyOf={(c) => String(c.id)}
      footer={<OrderNavigation active="customers" />}
      renderRow={(c) => (
        <CustomerRow
          customer={c}
          onPress={() => router.push({ pathname: '/cliente/[id]', params: { id: String(c.id) } })}
          trailing={
            c.registrationIncomplete ? (
              <StatusPill label="Incompleto" tone="primary" />
            ) : c.restrictionBlock ? (
              <StatusPill label="Bloqueado" tone="danger" />
            ) : c.restrictionAlert ? (
              <StatusPill label="Restrição" tone="primary" />
            ) : undefined
          }
        />
      )}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  newButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 62, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.background },
  customer: { flex: 1, gap: 2 },
}));
