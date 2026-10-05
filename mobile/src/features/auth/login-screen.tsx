import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { defaultDeviceName } from '@/features/auth/auth-api';
import { useSession } from '@/features/auth/session-context';
import { parsePairingLink, type PairingLink } from '@/features/auth/pairing';
import { ApiError } from '@/infrastructure/api/client';
import { appEnv } from '@/infrastructure/config';
import { BrandMark } from '@/shared/components/brand-mark';
import { Button } from '@/shared/components/button';
import { CodeScanner } from '@/shared/components/code-scanner';
import { EnvBadge } from '@/shared/components/env-badge';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { radius, shadow, spacing } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

const STEPS = ['No ComercialWeb, abra Configurações → Aplicativo Mobile', 'Clique em Gerar QR Code', 'Aponte a câmera do celular para o código'];

function messageFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.kind === 'network' || e.kind === 'timeout') return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    if (e.status === 429) {
      return e.retryAfterSeconds
        ? `Muitas tentativas. Aguarde ${e.retryAfterSeconds} s e tente de novo.`
        : 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    }
    if (e.kind === 'server') return 'O servidor não conseguiu falar com o ComercialWeb. Tente de novo em instantes.';
    if (e.kind === 'validation') return 'Código inválido ou expirado. Gere um novo QR Code no sistema.';
  }
  return 'Não foi possível conectar. Gere um novo QR Code e tente de novo.';
}

export function LoginScreen({ deepLink }: { deepLink?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { connect } = useSession();
  const [scanning, setScanning] = useState(false);
  const [link, setLink] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  // Link vindo de fora do app (câmera do sistema): só conecta após confirmação do usuário.
  const [fromLink] = useState(() => (deepLink ? parsePairingLink(deepLink, appEnv) : null));
  const [pending, setPending] = useState<PairingLink | null>(fromLink?.ok ? fromLink.link : null);
  const [error, setError] = useState<string | null>(fromLink && !fromLink.ok ? fromLink.message : null);
  const [submitting, setSubmitting] = useState(false);

  async function connectWith({ code }: PairingLink) {
    setError(null);
    setSubmitting(true);
    try {
      await connect(code, deviceName.trim() || defaultDeviceName);
    } catch (e) {
      setError(messageFor(e));
      setSubmitting(false);
    }
  }

  async function pairWith(raw: string) {
    if (submitting) return; // Enter repetido não pode gastar o código de uso único duas vezes
    const parsed = parsePairingLink(raw, appEnv);
    if (parsed.ok) await connectWith(parsed.link);
    else setError(parsed.message);
  }

  function onScanned(raw: string) {
    setScanning(false);
    void pairWith(raw);
  }

  if (scanning) return <CodeScanner types={['qr']} purpose="ler o QR Code de pareamento" onScanned={onScanned} onCancel={() => setScanning(false)} />;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={['top']} style={styles.content}>
            <View style={styles.logo}>
              <BrandMark size={52} color={colors.onPrimary} />
            </View>
            <View style={styles.badgeRow}>
              <EnvBadge />
            </View>
            <View style={styles.titleBlock}>
              <Text variant="title" style={[styles.brand, styles.center]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                Infinit Comercial
              </Text>
              <Text color="textMuted" style={styles.center}>
                Conecte este aparelho ao ComercialWeb em menos de um minuto.
              </Text>
            </View>

            {!pending && (
              <View style={styles.steps}>
                {STEPS.map((step, i) => (
                  <View key={step} style={styles.step}>
                    <View style={styles.stepNumber}>
                      <Text variant="label" color="primary">
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={styles.flex}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {pending ? (
              <View style={styles.form}>
                <Text style={styles.center}>{`Conectar este aparelho ao ComercialWeb ${new URL(pending.server).host}?`}</Text>
                {error && (
                  <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                )}
                <Button label="Conectar" onPress={() => connectWith(pending)} loading={submitting} />
                <Button label="Cancelar" variant="outline" onPress={() => setPending(null)} disabled={submitting} />
              </View>
            ) : (
              <View style={styles.form}>
                <TextField
                  label="Nome do aparelho"
                  icon="phone-portrait-outline"
                  value={deviceName}
                  onChangeText={setDeviceName}
                  maxLength={100}
                  autoCorrect={false}
                />
                <Button label="Ler QR Code" icon="qr-code-outline" onPress={() => setScanning(true)} loading={submitting} />

                {appEnv.allowManualPairing && (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.line} />
                      <Text variant="caption" color="textMuted">
                        ou cole o link
                      </Text>
                      <View style={styles.line} />
                    </View>

                    <TextField
                      label="Link de pareamento"
                      icon="link-outline"
                      placeholder="comercialweb://pair?code=…"
                      value={link}
                      onChangeText={setLink}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="go"
                      onSubmitEditing={() => pairWith(link)}
                    />
                    <Button label="Conectar" variant="outline" onPress={() => pairWith(link)} disabled={link.trim() === '' || submitting} />
                  </>
                )}
                {error && (
                  <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                )}
              </View>
            )}
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'space-between' },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  logo: { width: 88, height: 88, borderRadius: radius.xl, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, alignSelf: 'center' },
  titleBlock: { gap: spacing.xs, alignItems: 'center' },
  brand: { fontSize: 32, lineHeight: 40 },
  steps: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepNumber: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  badgeRow: { alignItems: 'center' },
  form: { gap: spacing.lg, marginTop: spacing.xl },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
}));
