import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth/session-context';
import { moduleLinks } from '@/features/menu/modules';
import { Icon } from '@/shared/components/icon';
import { ListRow } from '@/shared/components/list-row';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { layout, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

// Telas de um módulo do Menu (ex.: Comercial): atalhos para as telas reais do app.
export function ModuleScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { profile } = useSession();
  const module = moduleLinks[key];
  const links = module?.links.filter((l) => !l.permissions || l.permissions.some((p) => profile?.permissions.includes(p)));
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="title">{module?.title ?? 'Módulo'}</Text>
      </View>
      {module ? (
        <ScrollView contentContainerStyle={styles.content}>
          {links?.map((l) => (
            <ListRow key={l.title} title={l.title} lines={[l.description]} label={`${l.title}. ${l.description}`} onPress={() => router.push(l.href)} />
          ))}
        </ScrollView>
      ) : (
        <StateView kind="empty" message="Módulo não encontrado." />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.sm },
}));
