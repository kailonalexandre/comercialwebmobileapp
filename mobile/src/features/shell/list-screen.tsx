import { useRef, useState, type ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/shared/components/icon';
import { Pager } from '@/shared/components/pager';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { usePagedList, type PageFetcher } from '@/shared/hooks/use-paged-list';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { userMessage } from '@/shared/utils/error-message';

export type ListControls<T> = { patch: (change: (items: T[]) => T[]) => void; reload: () => void };

type Props<T> = {
  title: string;
  subtitle?: string;
  searchPlaceholder: string;
  emptyMessage: string;
  fetchPage: PageFetcher<T>;
  keyOf: (item: T) => string;
  renderRow: (item: T, controls: ListControls<T>) => ReactElement;
  onBack?: () => void;
  header?: ReactElement;
  // Controles logo abaixo da busca (filtros, ações em lote).
  filters?: ReactElement;
  // Telas dentro da barra de abas: o botão central invade a paginação e precisa de folga.
  tabScreen?: boolean;
};

// Tela de lista padrão: busca, paginação por rolagem, puxar para atualizar e estados de carga/erro/vazio.
export function ListScreen<T>({ title, subtitle, searchPlaceholder, emptyMessage, fetchPage, keyOf, renderRow, onBack, header, filters, tabScreen }: Props<T>) {
  const [search, setSearch] = useState('');
  const list = usePagedList(fetchPage, search.trim());
  const scroller = useRef<FlatList<T>>(null);
  const insets = useSafeAreaInsets();

  // Página nova começa no topo.
  const goTo = (page: number) => {
    scroller.current?.scrollToOffset({ offset: 0, animated: false });
    list.goTo(page);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <FlatList
        ref={scroller}
        data={list.items}
        keyExtractor={keyOf}
        renderItem={({ item }) => renderRow(item, { patch: list.patch, reload: list.reload })}
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
            {filters}
          </View>
        }
        ListEmptyComponent={
          list.status === 'loading' ? (
            <StateView kind="loading" />
          ) : list.status === 'error' ? (
            <StateView kind="error" message={userMessage(list.error)} onRetry={list.reload} />
          ) : (
            <StateView kind="empty" message={emptyMessage} />
          )
        }
      />
      <Pager page={list.page} totalPages={list.totalPages} total={list.total} failed={list.failed && list.items.length > 0} bottomGap={tabScreen ? spacing.xl : insets.bottom} onPage={goTo} onRetry={list.reload} />
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
});
