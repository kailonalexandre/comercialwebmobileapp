import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginWave } from '@/features/auth/login-wave';
import { useSession } from '@/features/auth/session-context';
import { QrScanner } from '@/features/auth/qr-scanner';
import { parsePairingLink } from '@/features/auth/pairing';
import { ApiError } from '@/infrastructure/api/client';
import { BrandMark } from '@/shared/components/brand-mark';
import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { colors, radius, spacing } from '@/shared/theme/tokens';

function messageFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.kind === 'network' || e.kind === 'timeout') return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    if (e.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (e.kind === 'server') return 'O servidor não conseguiu falar com o ComercialWeb. Tente de novo em instantes.';
    if (e.kind === 'validation') return 'QR inválido, expirado ou já usado. Gere um novo no ComercialWeb.';
  }
  return 'Não foi possível conectar. Gere um novo QR Code e tente de novo.';
}

export function LoginScreen() {
  const { connect } = useSession();
  const [scanning, setScanning] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pairWith(raw: string) {
    const parsed = parsePairingLink(raw);
    if (!parsed) {
      setError('Este não é um QR Code do ComercialWeb.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await connect(parsed.code);
    } catch (e) {
      setError(messageFor(e));
      setSubmitting(false);
    }
  }

  function onScanned(raw: string) {
    setScanning(false);
    void pairWith(raw);
  }

  if (scanning) return <QrScanner onScanned={onScanned} onCancel={() => setScanning(false)} />;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={['top']} style={styles.content}>
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.logo}>
              <BrandMark size={52} color={colors.onPrimary} />
            </LinearGradient>
            <View style={styles.titleBlock}>
              <Text variant="title" style={[styles.brand, styles.center]}>
                Infinit Comercial
              </Text>
              <Text color="textMuted" style={styles.center}>
                No ComercialWeb, abra Configurações → Aplicativo Mobile e gere um QR Code.
              </Text>
            </View>

            <View style={styles.form}>
              <Button label="Ler QR Code" icon="qr-code-outline" onPress={() => setScanning(true)} loading={submitting} />

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
              {error && (
                <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}
              <Button label="Conectar" variant="outline" onPress={() => pairWith(link)} disabled={link.trim() === '' || submitting} />
            </View>
          </SafeAreaView>
          <LoginWave />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'space-between' },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
  titleBlock: { gap: spacing.xs, alignItems: 'center' },
  center: { textAlign: 'center' },
  brand: { fontSize: 32, lineHeight: 40 },
  form: { gap: spacing.lg, marginTop: spacing.xl },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
});
