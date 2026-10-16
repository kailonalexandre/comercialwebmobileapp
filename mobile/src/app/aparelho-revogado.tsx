import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/session-context';
import { pendingBagAccounts } from '@/features/conditional/bag-queue';
import { pendingCustomerAccounts } from '@/features/customers/quick-customer-queue';
import { pendingSaleAccounts } from '@/features/sales/sale-queue';
import { BrandMark } from '@/shared/components/brand-mark';
import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { layout, spacing } from '@/shared/theme/tokens';

// Aparelho desvinculado no ComercialWeb (revogado). As sessões já caíram e os tokens saíram do aparelho. Operações
// offline não são descartadas: ficam guardadas e sobem quando o mesmo funcionário entrar de novo (aparelho revinculado
// à mesma empresa); o servidor revalida tudo nesse momento.
export default function RevokedRoute() {
  const { startAdding } = useSession();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    void Promise.all([pendingSaleAccounts(), pendingBagAccounts(), pendingCustomerAccounts()]).then((lists) => setPending(lists.flat().length));
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <BrandMark />
        <Text variant="title">Acesso revogado</Text>
        <Text>Este aparelho foi desvinculado da empresa pelo administrador. Ninguém pode entrar nele até que seja vinculado de novo.</Text>
        {pending > 0 && (
          <Text color="warning">{`${pending} operação(ões) feitas offline continuam guardadas e serão enviadas quando quem as fez entrar de novo neste aparelho, depois de revinculado.`}</Text>
        )}
        <Button label="Vincular com novo QR Code" icon="qr-code-outline" onPress={startAdding} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md },
});
