import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/features/shell/app-header';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { spacing } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';

// Tela provisória para abas cujo módulo ainda não foi implementado.
export function ComingSoonScreen({ title }: { title: string }) {
  const styles = useStyles();
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.content}>
        <AppHeader />
        <Text variant="title">{title}</Text>
      </View>
      <StateView kind="empty" message="Este módulo estará disponível em breve." />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  content: { padding: spacing.lg, gap: spacing.lg },
}));
