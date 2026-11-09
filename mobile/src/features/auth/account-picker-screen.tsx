import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/session-context';
import { BrandMark } from '@/shared/components/brand-mark';
import { Button } from '@/shared/components/button';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { layout, spacing } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';

// Quem vai usar o aparelho agora: cada vendedor/caixa tem a própria conta, pareada pelo QR dele. Conta com biometria
// pede digital/rosto (ou o bloqueio de tela do celular) para abrir; as outras abrem direto.
export function AccountPickerScreen() {
  const styles = useStyles();
  const { accounts, unlock, startAdding, removeAccount } = useSession();
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const auto = useRef(false);

  async function open(id: string) {
    setFailed(null);
    setOpening(id);
    const ok = await unlock(id);
    // Em sucesso a navegação já saiu desta tela; só a falha precisa avisar.
    if (!ok) {
      setOpening(null);
      setFailed('Não foi possível abrir esta conta. Se pedir, gere um novo QR Code no ComercialWeb.');
    }
  }

  // Uma conta só e com biometria: já pede a digital ao abrir o app, sem um toque a mais. Sem biometria a escolha fica na tela
  // (quem veio de "Trocar de usuário" quer ver as contas ou adicionar outra).
  useEffect(() => {
    if (auto.current || accounts.length !== 1 || !accounts[0]!.biometric) return;
    auto.current = true;
    void open(accounts[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmRemove = (id: string, name: string) =>
    Alert.alert('Remover esta conta do aparelho?', `${name} precisará ler um novo QR Code para voltar a usar o app neste aparelho.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => void removeAccount(id) },
    ]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrandMark />
        <Text variant="title">Quem está usando?</Text>
        {accounts.map((a) => (
          <View key={a.id} style={styles.account}>
            <ListRow
              title={a.userName || 'Conta'}
              lines={a.businessName ? [a.businessName] : []}
              onPress={() => void open(a.id)}
              trailing={a.biometric ? <StatusPill label="Biometria" tone="success" /> : undefined}
            />
            <Button label="Remover do aparelho" variant="outline" disabled={opening !== null} onPress={() => confirmRemove(a.id, a.userName || 'Esta conta')} />
          </View>
        ))}
        {failed && <Text color="danger" accessibilityLiveRegion="polite">{failed}</Text>}
        <Button label="Adicionar outra conta (QR Code)" icon="qr-code-outline" variant="outline" onPress={startAdding} disabled={opening !== null} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md },
  account: { gap: spacing.xs },
}));
