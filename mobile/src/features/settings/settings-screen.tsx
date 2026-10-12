import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { PushPreferencesSection } from '@/features/settings/push-preferences-section';
import { DetailFrame } from '@/features/shell/detail-frame';
import { apiBaseUrl, appEnv } from '@/infrastructure/config';
import { Button } from '@/shared/components/button';
import { InfoCard } from '@/shared/components/info-card';
import { Segmented } from '@/shared/components/segmented';
import { Text } from '@/shared/components/text';
import { useTheme, type ThemePreference } from '@/shared/theme/theme-context';
import { spacing } from '@/shared/theme/tokens';

const noop = () => undefined;

const APPEARANCE: { key: ThemePreference; label: string }[] = [
  { key: 'system', label: 'Automático' },
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Escuro' },
];

function confirmDisconnect(signOut: () => Promise<void>) {
  Alert.alert('Desconectar esta conta?', 'Ela sai deste aparelho. Para voltar será preciso gerar e ler um novo QR Code no ComercialWeb.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Desconectar', style: 'destructive', onPress: () => void signOut() },
  ]);
}

export function SettingsScreen() {
  const { profile, signOut, lock, accounts, activeAccountId, setBiometric } = useSession();
  const biometric = accounts.find((a) => a.id === activeAccountId)?.biometric ?? false;
  const { preference, setPreference } = useTheme();

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
          Aparência
        </Text>
        <Segmented options={APPEARANCE} selected={preference} onSelect={setPreference} />
      </View>
      <PushPreferencesSection />
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
      <Button
        label={biometric ? 'Desativar digital/Face ID' : 'Entrar com digital/Face ID'}
        variant="outline"
        icon="finger-print-outline"
        onPress={() => void setBiometric(!biometric).then((ok) => !ok && !biometric && Alert.alert('Biometria indisponível', 'Cadastre uma digital ou rosto nas configurações do celular e confirme para ativar.'))}
      />
      <Button label="Trocar de usuário" variant="outline" icon="people-outline" onPress={() => void lock()} />
      <Button label="Trocar empresa" variant="outline" icon="swap-horizontal-outline" onPress={() => router.push('/trocar-empresa')} />
      <Button label="Desconectar" variant="outline" icon="log-out-outline" onPress={() => confirmDisconnect(signOut)} />
    </DetailFrame>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
