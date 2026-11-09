import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { canSaveConditional } from '@/features/conditional/conditional-api';
import { useConditionalDraft } from '@/features/conditional/conditional-draft';
import { DraftEditor } from '@/features/presale/draft-editor';
import { estimateCents } from '@/features/presale/draft-model';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { layout, radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

// Novo condicional: monta a sacola e SALVA (a finalização continua no ComercialWeb). Sem conexão a sacola fica guardada
// no aparelho (fila de sincronização) e sobe sozinha, sem duplicar.
export function NewConditionalScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const store = useConditionalDraft();
  const insets = useSafeAreaInsets();
  const { draft, phase, send, reset } = store;
  const locked = phase.name !== 'editing';

  if (phase.name === 'done' || phase.name === 'queued') {
    const saved = phase.name === 'done';
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.doneBlock}>
          <View style={styles.doneIcon}>
            <Icon name={saved ? 'checkmark' : 'cloud-offline-outline'} size={40} color={saved ? colors.success : colors.primary} />
          </View>
          <Text variant="title">{saved ? (phase.sale.alreadyExisted ? 'Condicional já registrado' : 'Condicional salvo') : 'Condicional guardado'}</Text>
          {saved ? (
            <Text color="textMuted">
              Nº {phase.sale.number} · {formatCents(phase.sale.totalCents)}
            </Text>
          ) : (
            <>
              <Text color="textMuted">Sem confirmação do servidor. O condicional está guardado neste aparelho e será enviado sozinho quando a conexão voltar, sem duplicar.</Text>
              <Text variant="caption" color="textMuted">Acompanhe em Vendas, em “Aguardando sincronização”.</Text>
            </>
          )}
          <Button label="Novo condicional" onPress={reset} />
          <Button
            label="Ver vendas"
            variant="outline"
            onPress={() => {
              reset();
              router.dismissTo('/vendas');
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.flex}>Novo condicional</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <DraftEditor store={store} mode="conditional" locked={locked} canDiscount={false} />

        {phase.name === 'editing' && phase.error && (
          <Text color="danger" accessibilityLiveRegion="polite">
            {phase.error}
          </Text>
        )}
        <Text variant="caption" color="textMuted">
          Salvar reserva as mercadorias (baixa o estoque) como no ComercialWeb. Para receber ou finalizar, use o ComercialWeb.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.flex}>
          <Text variant="caption" color="textMuted">
            Total estimado
          </Text>
          <Text variant="total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatCents(estimateCents(draft.items))}</Text>
        </View>
        <View style={styles.footerButton}>
          <Button label="Salvar condicional" onPress={send} loading={phase.name === 'sending'} disabled={!canSaveConditional(draft)} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  content: { ...layout.content, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  flex: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  footerButton: { flex: 1 },
  doneBlock: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
}));
