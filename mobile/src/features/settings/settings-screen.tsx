import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { acceptablePin, setPin } from '@/features/auth/auth-api';
import { useSession } from '@/features/auth/session-context';
import { PushPreferencesSection } from '@/features/settings/push-preferences-section';
import { DetailFrame } from '@/features/shell/detail-frame';
import { ApiError } from '@/infrastructure/api/client';
import { apiBaseUrl, appEnv } from '@/infrastructure/config';
import { Button } from '@/shared/components/button';
import { InfoCard } from '@/shared/components/info-card';
import { Segmented } from '@/shared/components/segmented';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { useTheme, type ThemePreference } from '@/shared/theme/theme-context';
import { spacing } from '@/shared/theme/tokens';

const noop = () => undefined;

const APPEARANCE: { key: ThemePreference; label: string }[] = [
  { key: 'system', label: 'Automático' },
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Escuro' },
];

function confirmDisconnect(signOut: () => Promise<void>, bound: boolean) {
  const text = bound
    ? 'Sua sessão sai deste aparelho. Para voltar, entre de novo com seu acesso.'
    : 'Ela sai deste aparelho. Para voltar será preciso gerar e ler um novo QR Code no ComercialWeb.';
  Alert.alert('Desconectar esta conta?', text, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Desconectar', style: 'destructive', onPress: () => void signOut() },
  ]);
}

// PIN para entrar rápido nos aparelhos compartilhados da empresa. Só quem acabou de provar a senha define.
function PinSection() {
  const [password, setPassword] = useState('');
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function save() {
    setMessage(null);
    if (!acceptablePin(pin)) return setMessage({ text: 'Use 6 números que não sejam sequência nem repetição.', ok: false });
    if (pin !== confirm) return setMessage({ text: 'Os PINs não conferem.', ok: false });
    setBusy(true);
    try {
      await setPin(password, pin);
      setPassword('');
      setPinValue('');
      setConfirm('');
      setMessage({ text: 'PIN definido. Na próxima troca de operador, entre com ele.', ok: true });
    } catch (e) {
      const code = e instanceof ApiError ? e.refusal?.code : undefined;
      setMessage({ text: code === 'weak_pin' ? 'PIN muito fácil. Escolha outro.' : code === 'invalid_credentials' ? 'Senha atual incorreta.' : 'Não foi possível salvar o PIN.', ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text variant="label" color="textMuted">PIN deste aparelho</Text>
      <TextField label="Senha atual" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry />
      <TextField label="Novo PIN (6 números)" icon="keypad-outline" value={pin} onChangeText={(v) => setPinValue(v.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <TextField label="Repita o PIN" icon="keypad-outline" value={confirm} onChangeText={(v) => setConfirm(v.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <Button label="Salvar PIN" variant="outline" loading={busy} disabled={password === '' || pin.length !== 6} onPress={() => void save()} />
      {message && <Text variant="caption" color={message.ok ? 'success' : 'danger'} accessibilityLiveRegion="polite">{message.text}</Text>}
    </View>
  );
}

export function SettingsScreen() {
  const { profile, signOut, lock, accounts, activeAccountId, setBiometric, terminal, policy } = useSession();
  const biometric = accounts.find((a) => a.id === activeAccountId)?.biometric ?? false;
  const { preference, setPreference } = useTheme();
  const shared = policy?.mode === 'shared';

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
      {terminal && (
        <View style={styles.section}>
          <Text variant="label" color="textMuted">
            Aparelho
          </Text>
          <InfoCard
            rows={[
              { label: 'Nome', value: terminal.name },
              { label: 'Vinculado a', value: terminal.businessName },
              { label: 'Uso', value: terminal.mode === 'shared' ? 'Compartilhado (troca de operador com PIN)' : 'Pessoal' },
              { label: 'Bloqueio por inatividade', value: policy ? `${Math.round(policy.idleLockSeconds / 60)} min` : '—' },
              { label: 'Operação sem internet', value: policy ? `até ${policy.offlineHours} h sem conexão` : '—' },
            ]}
          />
        </View>
      )}
      {shared && <PinSection />}
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
      {!shared && (
        <Button
          label={biometric ? 'Desativar digital/Face ID' : 'Entrar com digital/Face ID'}
          variant="outline"
          icon="finger-print-outline"
          onPress={() => void setBiometric(!biometric).then((ok) => !ok && !biometric && Alert.alert('Biometria indisponível', 'Cadastre uma digital ou rosto nas configurações do celular e confirme para ativar.'))}
        />
      )}
      <Button label={shared ? 'Trocar operador' : terminal ? 'Bloquear agora' : 'Trocar de usuário'} variant="outline" icon="people-outline" onPress={() => void lock()} />
      {!shared && <Button label="Trocar empresa" variant="outline" icon="swap-horizontal-outline" onPress={() => router.push('/trocar-empresa')} />}
      <Button label="Desconectar" variant="outline" icon="log-out-outline" onPress={() => confirmDisconnect(signOut, !!terminal)} />
    </DetailFrame>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
