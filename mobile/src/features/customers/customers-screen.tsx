import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ListScreen } from '@/features/shell/list-screen';
import { fetchCustomers } from '@/features/customers/customers-api';
import { useSession } from '@/features/auth/session-context';
import { PendingCustomers } from '@/features/customers/pending-customers';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';

export function CustomersScreen() {
  const { profile } = useSession();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <ListScreen
      header={<PendingCustomers />}
      action={
        profile?.permissions.includes('people.create') ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Novo cliente" onPress={() => router.push('/cliente-novo')} style={styles.newButton}>
            <Icon name="add" size={18} color={colors.primary} />
            <Text variant="label" color="primary">
              Novo
            </Text>
          </Pressable>
        ) : undefined
      }
      title="Clientes"
      searchPlaceholder="Nome, documento ou telefone"
      emptyMessage="Nenhum cliente encontrado."
      fetchPage={fetchCustomers}
      keyOf={(c) => String(c.id)}
      onBack={() => router.back()}
      renderRow={(c) => (
        <ListRow
          title={c.name}
          lines={[c.phone, c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : null].filter((v): v is string => !!v)}
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
  newButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
}));
