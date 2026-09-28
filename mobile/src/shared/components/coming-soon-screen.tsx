import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dashboardMock } from '@/features/dashboard/mock';
import { AppHeader } from '@/shared/components/app-header';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { colors, spacing } from '@/shared/theme/tokens';

// Tela provisória para abas cujo módulo ainda não foi implementado.
export function ComingSoonScreen({ title }: { title: string }) {
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.content}>
        <AppHeader userName={dashboardMock.userName} unreadNotifications={dashboardMock.unreadNotifications} />
        <Text variant="title">{title}</Text>
      </View>
      <StateView kind="empty" message="Este módulo estará disponível em breve." />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
});
