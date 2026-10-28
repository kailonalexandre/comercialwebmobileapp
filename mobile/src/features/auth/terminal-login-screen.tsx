import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LoginInput, Operator } from '@/features/auth/auth-api';
import { deviceSecured } from '@/features/auth/biometric';
import { parsePairingLink } from '@/features/auth/pairing';
import { PendingOperationsError, useSession } from '@/features/auth/session-context';
import { ApiError } from '@/infrastructure/api/client';
import { appEnv } from '@/infrastructure/config';
import { BrandMark } from '@/shared/components/brand-mark';
import { Button } from '@/shared/components/button';
import { CodeScanner } from '@/shared/components/code-scanner';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { layout, spacing } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';

export function loginErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.kind === 'network' || e.kind === 'timeout') return 'Sem conexão. Para entrar é preciso internet.';
    const code = e.refusal?.code;
    if (code === 'account_locked') return `Muitas tentativas erradas. Aguarde ${Math.ceil((e.retryAfterSeconds ?? 900) / 60)} min ou peça o desbloqueio ao administrador.`;
    if (e.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (code === 'terminal_assigned') return 'Este aparelho é de uso pessoal de outro funcionário.';
    if (code === 'terminal_revoked') return 'Este aparelho não está mais vinculado à empresa.';
    if (e.status === 401) return 'Usuário, senha ou PIN incorretos, ou acesso ao aplicativo não liberado.';
    if (e.kind === 'validation') return 'Confira os dados digitados.';
    if (e.kind === 'server') return 'O servidor está indisponível. Tente de novo em instantes.';
  }
  return 'Não foi possível entrar. Tente de novo.';
}

type Mode = { kind: 'choose' } | { kind: 'pin'; operator: Operator } | { kind: 'password' } | { kind: 'scanInvite' } | { kind: 'invite'; code: string };

// Entrada no aparelho vinculado. Pessoal: o dono desbloqueia com a biometria (ou entra com a senha). Compartilhado:
// cada operador se escolhe na lista e entra com o próprio PIN; ninguém continua a sessão de outro.
export function TerminalLoginScreen() {
  const styles = useStyles();
  const { terminal, accounts, notice, login, unlock, checkTerminal, unbind } = useSession();
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'choose' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLogin, setUserLogin] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const auto = useRef(false);

  const shared = terminal?.mode === 'shared';
  const owner = shared ? undefined : accounts.find((a) => a.terminalId === terminal?.id && a.policy?.mode === 'personal');

  const reload = useCallback(() => void checkTerminal().then(setOperators), [checkTerminal]);
  useEffect(reload, [reload]);

  const tryUnlock = useCallback(async () => {
    if (!owner) return;
    setError(null);
    if (await unlock(owner.id)) return;
    setError(!owner.biometric && !(await deviceSecured())
      ? 'Este celular não tem bloqueio de tela, então o app pede a senha ao abrir. Ative o bloqueio de tela para desbloquear sem senha.'
      : 'Não desbloqueou. Entre com sua senha.');
  }, [owner, unlock]);

  // Pessoal com biometria: já pede a digital ao abrir, sem um toque a mais.
  useEffect(() => {
    if (auto.current || !owner?.biometric) return;
    auto.current = true;
    void tryUnlock();
  }, [owner, tryUnlock]);

  async function submit(input: LoginInput) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login(input); // sucesso: a navegação sai desta tela
    } catch (e) {
      setError(loginErrorMessage(e));
      setPin('');
      setBusy(false);
    }
  }

  function back() {
    setMode({ kind: 'choose' });
    setError(null);
    setPassword('');
    setPin('');
    setConfirm('');
  }

  function onInviteScanned(raw: string) {
    const parsed = parsePairingLink(raw, appEnv);
    if (parsed.ok && parsed.link.kind === 'invite') setMode({ kind: 'invite', code: parsed.link.code });
    else {
      setMode({ kind: 'choose' });
      setError(parsed.ok ? 'Este QR Code não é um convite. Peça ao administrador para gerar o convite em Aplicativo Mobile.' : parsed.message);
    }
  }

  function confirmUnbind() {
    Alert.alert('Desvincular este aparelho?', 'Todas as contas saem deste aparelho. Para usar de novo será preciso um novo QR Code de vínculo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular', style: 'destructive',
        onPress: () => void unbind().catch((e) =>
          setError(e instanceof PendingOperationsError ? 'Há vendas ou cadastros ainda não enviados. Conecte-se e aguarde a sincronização antes de desvincular.' : 'Não foi possível desvincular.')),
      },
    ]);
  }

  if (!terminal) return null;
  if (mode.kind === 'scanInvite') return <CodeScanner types={['qr']} purpose="ler o QR Code do convite" onScanned={onInviteScanned} onCancel={back} />;

  const weakInvite = mode.kind === 'invite' && (password.length < 8 || password !== confirm);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BrandMark />
          <View style={styles.header}>
            <Text variant="title">{shared ? 'Quem está usando?' : 'Entrar'}</Text>
            <Text color="textMuted">{`${terminal.name} · ${terminal.businessName}`}</Text>
            <StatusPill label={shared ? 'Aparelho compartilhado' : 'Aparelho pessoal'} tone={shared ? 'info' : 'primary'} />
          </View>
          {notice && <Text color="warning" accessibilityLiveRegion="polite">{notice}</Text>}

          {mode.kind === 'choose' && (
            <>
              {owner && <Button label={`Desbloquear ${owner.userName}`} icon="finger-print-outline" onPress={() => void tryUnlock()} />}
              {shared && operators === null && <Text color="textMuted">Sem conexão: a lista de operadores aparece quando houver internet.</Text>}
              {shared && operators?.length === 0 && <Text color="textMuted">Nenhum funcionário liberado para o app nesta empresa.</Text>}
              {shared && operators?.map((o) => (
                <ListRow
                  key={o.id}
                  title={o.name}
                  lines={[o.hasPin ? 'Entrar com PIN' : 'Sem PIN: entrar com usuário e senha']}
                  onPress={() => setMode(o.hasPin ? { kind: 'pin', operator: o } : { kind: 'password' })}
                  trailing={o.hasPin ? <StatusPill label="PIN" tone="success" /> : undefined}
                />
              ))}
              <Button label="Entrar com usuário e senha" icon="key-outline" variant={owner || shared ? 'outline' : undefined} onPress={() => setMode({ kind: 'password' })} />
              <Button label="Primeiro acesso (convite)" icon="qr-code-outline" variant="outline" onPress={() => setMode({ kind: 'scanInvite' })} />
              {shared && <Button label="Atualizar lista" icon="refresh-outline" variant="outline" onPress={reload} />}
            </>
          )}

          {mode.kind === 'pin' && (
            <View style={styles.form}>
              <Text>{`PIN de ${mode.operator.name}`}</Text>
              <TextField label="PIN (6 números)" icon="keypad-outline" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} keyboardType="number-pad"
                secureTextEntry maxLength={6} autoFocus onSubmitEditing={() => pin.length === 6 && void submit({ method: 'pin', userId: mode.operator.id, pin })} />
              <Button label="Entrar" loading={busy} disabled={pin.length !== 6} onPress={() => void submit({ method: 'pin', userId: mode.operator.id, pin })} />
              <Button label="Voltar" variant="outline" disabled={busy} onPress={back} />
            </View>
          )}

          {mode.kind === 'password' && (
            <View style={styles.form}>
              <TextField label="E-mail ou usuário" icon="person-outline" value={userLogin} onChangeText={setUserLogin} autoCapitalize="none" autoCorrect={false} autoFocus />
              <TextField label="Senha" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry
                onSubmitEditing={() => void submit({ method: 'password', login: userLogin.trim(), password })} />
              <Button label="Entrar" loading={busy} disabled={userLogin.trim() === '' || password === ''} onPress={() => void submit({ method: 'password', login: userLogin.trim(), password })} />
              <Text variant="caption" color="textMuted">Esqueceu a senha? Peça um convite novo ao administrador (Configurações → Aplicativo Mobile).</Text>
              <Button label="Voltar" variant="outline" disabled={busy} onPress={back} />
            </View>
          )}

          {mode.kind === 'invite' && (
            <View style={styles.form}>
              <Text>Convite lido. Crie sua senha (mínimo de 8 caracteres).</Text>
              <TextField label="Nova senha" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry autoFocus />
              <TextField label="Repita a senha" icon="lock-closed-outline" value={confirm} onChangeText={setConfirm} secureTextEntry
                error={confirm !== '' && confirm !== password ? 'As senhas não conferem.' : undefined} />
              <Button label="Criar senha e entrar" loading={busy} disabled={weakInvite} onPress={() => void submit({ method: 'invite', inviteCode: mode.code, newPassword: password })} />
              <Button label="Voltar" variant="outline" disabled={busy} onPress={back} />
            </View>
          )}

          {error && <Text color="danger" accessibilityLiveRegion="polite">{error}</Text>}
          {mode.kind === 'choose' && <Button label="Desvincular este aparelho" icon="unlink-outline" variant="outline" onPress={confirmUnbind} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.xs, alignItems: 'flex-start' },
  form: { gap: spacing.md },
}));
