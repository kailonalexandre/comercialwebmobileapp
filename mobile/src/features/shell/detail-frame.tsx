import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/shared/components/icon';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import type { DetailFailure } from '@/shared/hooks/use-detail';
import { layout, radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { userMessage } from '@/shared/utils/error-message';

type Props = {
  title: string;
  loading: boolean;
  failure: DetailFailure | null;
  error: unknown;
  notFoundMessage: string;
  onRetry: () => void;
  children: ReactNode;
};

// Moldura das telas de detalhe: voltar, título e os estados de carga, erro e "não encontrado".
export function DetailFrame({ title, loading, failure, error, notFoundMessage, onRetry, children }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={[styles.back, styles.backFilled]}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="heading" style={styles.title}>
          {title}
        </Text>
        <View style={styles.back} />
      </View>
      {loading && <StateView kind="loading" />}
      {failure === 'not_found' && <StateView kind="empty" message={notFoundMessage} />}
      {failure === 'error' && <StateView kind="error" message={userMessage(error)} onRetry={onRetry} />}
      {!loading && !failure && <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { flex: 1, textAlign: 'center' },
  backFilled: { backgroundColor: colors.background, ...shadow.card },
  // O botão da direita é só um espaço para manter o título centralizado.
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
}));
