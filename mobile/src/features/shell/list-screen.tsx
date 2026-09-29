import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/shared/components/icon';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { usePagedList, type PageFetcher } from '@/shared/hooks/use-paged-list';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';

type Props<T> = {
  title: string;
  subtitle?: string;
  searchPlaceholder: string;
  emptyMessage: string;
  fetchPage: PageFetcher<T>;
  keyOf: (item: T) => string;
  renderRow: (item: T) => ReactElement;
  onBack?: () => void;
  header?: ReactElement;
};

// Tela de lista padrão: busca, paginação por rolagem, puxar para atualizar e estados de carga/erro/vazio.
export function ListScreen<T>({ title, subtitle, searchPlaceholder, emptyMessage, fetchPage, keyOf, renderRow, onBack, header }: Props<T>) {
  const [search, setSearch] = useState('');
  const list = usePagedList(fetchPage, search.trim());

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <FlatList
        data={list.items}
        keyExtractor={keyOf}
        renderItem={({ item }) => renderRow(item)}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        refreshing={false}
        onRefresh={list.reload}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {header}
            <View style={styles.titleRow}>
              {onBack && (
                <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.back}>
                  <Icon name="chevron-back" size={26} color={colors.text} />
                </Pressable>
              )}
              <View style={styles.flex}>
                <Text variant="title">{title}</Text>
                {subtitle && <Text color="textMuted">{subtitle}</Text>}
              </View>
            </View>
            <TextField
              icon="search-outline"
              placeholder={searchPlaceholder}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        }
        ListEmptyComponent={
          list.status === 'loading' ? (
            <StateView kind="loading" />
          ) : list.status === 'error' ? (
            <StateView kind="error" onRetry={list.reload} />
          ) : (
            <StateView kind="empty" message={emptyMessage} />
          )
        }
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null}
      />
    </SafeAreaView>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, flexGrow: 1 },
  headerBlock: { gap: spacing.md, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  separator: { height: spacing.sm },
  footer: { padding: spacing.lg },
});
