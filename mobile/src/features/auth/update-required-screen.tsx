import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/session-context';
import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';

// Versão abaixo da mínima do servidor: bloqueia o app até instalar a atualização.
export function UpdateRequiredScreen() {
  const styles = useStyles();
  const { signOut } = useSession();
  return (
    <SafeAreaView style={styles.root}>
      <Text variant="title" style={styles.center}>
        Atualização necessária
      </Text>
      <Text color="textMuted" style={styles.center}>
        Esta versão do aplicativo não é mais aceita pelo servidor. Instale a versão mais recente para continuar.
      </Text>
      <Button label="Desconectar" variant="outline" onPress={() => void signOut()} />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.background },
  center: { textAlign: 'center' },
}));
