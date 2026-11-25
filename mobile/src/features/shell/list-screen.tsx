import { useRef, useState, type ReactElement } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CodeScanner } from '@/shared/components/code-scanner';
import { Icon } from '@/shared/components/icon';
import { OrderHeader } from '@/shared/components/order-ui';
import { Pager } from '@/shared/components/pager';
import { StateView } from '@/shared/components/state-view';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { usePagedList, type PageFetcher } from '@/shared/hooks/use-paged-list';
import { layout, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
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
  // Botão à direita do título (ex.: "+ Pré-venda").
  action?: ReactElement;
  // Agrupa a lista: um cabeçalho aparece quando o valor muda em relação ao item anterior.
  sectionOf?: (item: T) => string;
  onBack?: () => void;
  header?: ReactElement;
  // Controles logo abaixo da busca (filtros, ações em lote).
  filters?: ReactElement;
  // Telas dentro da barra de abas: o botão central invade a paginação e precisa de folga.
  tabScreen?: boolean;
  // Mostra na busca o botão de leitura de código de barras pela câmera.
  scanBarcode?: boolean;
  orderLayout?: boolean;
  grid?: boolean;
  searchAction?: ReactElement;
  listControls?: (total: number) => ReactElement;
  footer?: ReactElement;
  filterKey?: string;
};

const BARCODES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'] as const;

// Tela de lista padrão: busca, paginação por rolagem, puxar para atualizar e estados de carga/erro/vazio.
export function ListScreen<T>({ title, subtitle, searchPlaceholder, emptyMessage, fetchPage, keyOf, renderRow, onBack, header, filters, tabScreen, scanBarcode, action, sectionOf, orderLayout, grid, searchAction, listControls, footer, filterKey }: Props<T>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const list = usePagedList(fetchPage, search.trim(), filterKey);
  const scroller = useRef<FlatList<T>>(null);
  const insets = useSafeAreaInsets();

  // Página nova começa no topo.
  const goTo = (page: number) => {
    scroller.current?.scrollToOffset({ offset: 0, animated: false });
    list.goTo(page);
  };

  if (scanning) {
    return (
      <CodeScanner
        types={[...BARCODES]}
        purpose="ler o código de barras do produto"
        onScanned={(code) => {
          setSearch(code.trim());
          setScanning(false);
        }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  const searchField = (
    <View style={styles.searchRow}>
      <View style={styles.flex}>
        <TextField
          icon="search-outline"
          placeholder={searchPlaceholder}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          returnKeyType="search"
          numberOfLines={orderLayout ? 1 : undefined}
          style={orderLayout && styles.orderSearchInput}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          trailing={
            scanBarcode && (!orderLayout || searchFocused || search !== '') ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Ler código de barras" onPress={() => setScanning(true)} hitSlop={spacing.sm}>
                <Icon name="barcode-outline" size={24} color={colors.primary} />
              </Pressable>
            ) : undefined
          }
        />
      </View>
      {searchAction}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      {orderLayout && <OrderHeader title={title} subtitle={subtitle} onBack={onBack} action={action} />}
      <FlatList
        key={grid ? 'grid' : 'list'}
        numColumns={grid ? 2 : 1}
        columnWrapperStyle={grid ? styles.gridRow : undefined}
        ref={scroller}
        showsVerticalScrollIndicator={false}
        data={list.items}
        keyExtractor={keyOf}
        renderItem={({ item, index }) => {
          const section = sectionOf?.(item);
          const newSection = section !== undefined && (index === 0 || sectionOf?.(list.items[index - 1] as T) !== section);
          return (
            <View style={grid && styles.gridCell}>
              {newSection && (
                <Text variant="mono" color="textMuted" style={styles.section}>
                  {section}
                </Text>
              )}
              {renderRow(item, { patch: list.patch, reload: list.reload })}
            </View>
          );
        }}
        refreshing={false}
        onRefresh={list.reload}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, orderLayout && styles.orderContent, orderLayout && { paddingBottom: footer ? spacing.lg : spacing.lg + insets.bottom }]}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {header}
            {!orderLayout && <View style={styles.titleRow}>
              {onBack && (
                <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.back}>
                  <Icon name="chevron-back" size={26} color={colors.text} />
                </Pressable>
              )}
              <View style={styles.flex}>
                <Text variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
                {subtitle && <Text color="textMuted">{subtitle}</Text>}
              </View>
              {action}
            </View>}
            {searchField}
            {filters}
            {listControls?.(list.total)}
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
      {(!orderLayout || list.totalPages > 1 || (list.failed && list.items.length > 0)) && (
        <Pager page={list.page} totalPages={list.totalPages} total={list.total} failed={list.failed && list.items.length > 0}
          bottomGap={footer ? 0 : tabScreen ? spacing.xl : insets.bottom} onPage={goTo} onRetry={list.reload} />
      )}
      {footer}
    </SafeAreaView>
  );
}

function Separator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

const useStyles = makeStyles((colors) => ({
  section: { marginTop: spacing.md, marginBottom: spacing.sm },
  root: { flex: 1, backgroundColor: colors.page },
  content: { ...layout.content, padding: spacing.lg, paddingBottom: spacing.xxl * 2, flexGrow: 1 },
  orderContent: { paddingTop: spacing.sm },
  orderSearchInput: { fontSize: 13, paddingHorizontal: 0 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gridRow: { gap: spacing.sm },
  gridCell: { flexBasis: '49%', flexShrink: 1, alignSelf: 'stretch' },
  headerBlock: { gap: spacing.md, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  separator: { height: spacing.sm },
}));
