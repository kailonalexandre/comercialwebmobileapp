import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/theme-context';

// Estados padrão de tela: carregando, vazio e erro. Mensagens nunca expõem detalhes técnicos.
type Props =
  | { kind: 'loading' }
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message?: string; onRetry?: () => void };

export function StateView(props: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {props.kind === 'loading' && <ActivityIndicator color={colors.primary} size="large" />}
      {props.kind === 'empty' && (
        <Text color="textMuted" style={styles.center}>
          {props.message}
        </Text>
      )}
      {props.kind === 'error' && (
        <>
          <Text color="danger" style={styles.center}>
            {props.message ?? 'Não foi possível concluir a operação.'}
          </Text>
          {props.onRetry && <Button label="Tentar novamente" variant="secondary" onPress={props.onRetry} />}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  center: { textAlign: 'center' },
});
