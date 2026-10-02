import { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { fetchMutedDomains, PUSH_DOMAINS, saveMutedDomains, setReceiving } from '@/features/push/push-preferences';
import { Text } from '@/shared/components/text';
import { userMessage } from '@/shared/utils/error-message';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';

// Escolha do que avisa no celular. O sino dentro do app continua listando tudo.
export function PushPreferencesSection() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [muted, setMuted] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMutedDomains()
      .then(setMuted)
      .catch((e) => setError(userMessage(e) ?? 'Não foi possível carregar suas preferências.'));
  }, []);

  const toggle = useCallback(
    (key: string, receive: boolean) => {
      if (muted === null) return;
      const next = setReceiving(muted, key, receive);
      setMuted(next);
      setError(null);
      // Falhou: volta ao que o servidor tinha, para a tela nunca mentir sobre o que vai tocar.
      Promise.resolve(saveMutedDomains(next)).catch((e) => {
        setMuted(muted);
        setError(userMessage(e) ?? 'Não foi possível salvar. Tente de novo.');
      });
    },
    [muted],
  );

  return (
    <View style={styles.section}>
      <Text variant="label" color="textMuted">
        Avisos no celular
      </Text>
      <View style={styles.card}>
        {PUSH_DOMAINS.map((d) => (
          <View key={d.key} style={styles.row}>
            <View style={styles.texts}>
              <Text>{d.label}</Text>
              <Text variant="caption" color="textMuted">
                {d.hint}
              </Text>
            </View>
            <Switch
              accessibilityLabel={`Avisos de ${d.label}`}
              disabled={muted === null}
              value={muted !== null && !muted.includes(d.key)}
              onValueChange={(v) => toggle(d.key, v)}
              trackColor={{ true: colors.primary }}
            />
          </View>
        ))}
      </View>
      {error && (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: spacing.sm },
  card: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: touchTarget },
  texts: { flex: 1 },
}));
