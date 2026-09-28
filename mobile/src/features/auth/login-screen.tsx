import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginWave } from '@/features/auth/login-wave';
import { useSession } from '@/features/auth/session-context';
import { webBaseUrl } from '@/infrastructure/config';
import { BrandMark } from '@/shared/components/brand-mark';
import { Button } from '@/shared/components/button';
import { Checkbox } from '@/shared/components/checkbox';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';

// Páginas públicas do ComercialWeb web, abertas no navegador do sistema (sem WebView).
function openWeb(path: string) {
  if (webBaseUrl) Linking.openURL(`${webBaseUrl}${path}`).catch(() => undefined);
}

export function LoginScreen() {
  const { signIn } = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (login.trim().length === 0 || password.length === 0) {
      setError('Informe e-mail ou usuário e senha.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn({ login: login.trim(), password }, remember);
    } catch {
      // Mensagem única: não revela se o usuário existe.
      setError('Usuário ou senha incorretos.');
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={['top']} style={styles.content}>
            {webBaseUrl && (
              <View style={styles.signup}>
                <Text variant="caption">Não tem uma conta?</Text>
                <Pressable accessibilityRole="link" onPress={() => openWeb('/register')} hitSlop={spacing.md}>
                  <Text variant="label" color="primary" style={styles.link}>
                    Registre-se
                  </Text>
                </Pressable>
              </View>
            )}

            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.logo}>
              <BrandMark size={52} color={colors.onPrimary} />
            </LinearGradient>
            <View style={styles.titleBlock}>
              <Text variant="title" style={[styles.brand, styles.center]}>
                Infinit Comercial
              </Text>
              <Text color="textMuted" style={styles.center}>
                Sua operação, mais simples.
              </Text>
            </View>

            <View style={styles.form}>
              <TextField
                label="E-mail ou usuário"
                icon="mail-outline"
                placeholder="Digite seu e-mail ou usuário"
                value={login}
                onChangeText={setLogin}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
              />
              <TextField
                label="Senha"
                icon="lock-closed-outline"
                placeholder="Digite sua senha"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eye}
                  >
                    <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.text} />
                  </Pressable>
                }
              />

              <View style={styles.options}>
                <Checkbox label="Lembrar de mim" checked={remember} onChange={setRemember} />
                {webBaseUrl && (
                  <Pressable accessibilityRole="link" onPress={() => openWeb('/forgot-password')} hitSlop={spacing.md}>
                    <Text variant="caption" color="primary" style={styles.link}>
                      Esqueceu sua senha?
                    </Text>
                  </Pressable>
                )}
              </View>

              {error && (
                <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}

              <Button label="Entrar" trailingIcon="arrow-forward" onPress={submit} loading={submitting} />

              <View style={styles.divider}>
                <View style={styles.line} />
                <Text variant="caption" color="textMuted">
                  ou
                </Text>
                <View style={styles.line} />
              </View>

              {/* Login por QR exige token temporário de uso único validado no servidor (seção 7.11). */}
              <Button
                label="Entrar com QR Code"
                variant="outline"
                icon="qr-code-outline"
                onPress={() => Alert.alert('Entrar com QR Code', 'Em breve.')}
              />
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
  signup: { alignItems: 'flex-end', gap: spacing.xs, paddingTop: spacing.lg },
  link: { textDecorationLine: 'underline' },
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
  eye: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.md },
  options: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
});
