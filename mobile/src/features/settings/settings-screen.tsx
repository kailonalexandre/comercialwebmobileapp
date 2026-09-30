import Constants from 'expo-constants';
import { Alert, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { DetailFrame } from '@/features/shell/detail-frame';
import { apiBaseUrl, appEnv } from '@/infrastructure/config';
import { Button } from '@/shared/components/button';
import { InfoCard } from '@/shared/components/info-card';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';

const noop = () => undefined;

function confirmDisconnect(signOut: () => Promise<void>) {
  Alert.alert('Desconectar este aparelho?', 'Para entrar de novo será preciso gerar e ler um novo QR Code no ComercialWeb.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Desconectar', style: 'destructive', onPress: () => void signOut() },
  ]);
}

export function SettingsScreen() {
  const { profile, signOut } = useSession();

  return (
    <DetailFrame title="Configurações" loading={false} failure={null} error={null} notFoundMessage="" onRetry={noop}>
      <View style={styles.section}>
        <Text variant="label" color="textMuted">
          Conta
        </Text>
        <InfoCard
          rows={[
            { label: 'Usuário', value: profile?.userName ?? '…' },
            { label: 'Empresa', value: profile?.businessName ?? '…' },
          ]}
        />
      </View>
      <View style={styles.section}>
        <Text variant="label" color="textMuted">
          Sobre
        </Text>
        <InfoCard
          rows={[
            { label: 'Versão do aplicativo', value: Constants.expoConfig?.version },
            { label: 'Ambiente', value: appEnv.name === 'local' ? 'Local (desenvolvimento)' : 'Produção' },
            { label: 'Servidor', value: apiBaseUrl ? new URL(apiBaseUrl).host : 'Não configurado (modo demonstração)' },
          ]}
        />
      </View>
      <Button label="Desconectar" variant="outline" icon="log-out-outline" onPress={() => confirmDisconnect(signOut)} />
    </DetailFrame>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
