import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useOnboarding } from '@/features/onboarding/onboarding-context';
import { BrandMark } from '@/shared/components/brand-mark';
import { Button } from '@/shared/components/button';
import { Icon, type IconName } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { colors, radius, spacing } from '@/shared/theme/tokens';

type Slide = {
  icon: IconName | 'brand';
  title: string;
  subtitle: string;
  features: { icon: IconName; text: string }[];
};

const slides: Slide[] = [
  {
    icon: 'brand',
    title: 'Mantenha cada operação em um só lugar.',
    subtitle: 'Acompanhe vendas, estoque e atividade do cliente sem sair do ambiente.',
    features: [
      { icon: 'bag-check-outline', text: 'Pedidos e faturamento em um único fluxo.' },
      { icon: 'layers-outline', text: 'Visibilidade de estoque em todos os negócios.' },
      { icon: 'document-text-outline', text: 'Documentos e aprovações sem alternar de contexto.' },
    ],
  },
  {
    icon: 'phone-portrait-outline',
    title: 'Sua empresa na palma da mão.',
    subtitle: 'Consulte produtos, clientes e vendas de onde estiver.',
    features: [
      { icon: 'pricetags-outline', text: 'Catálogo e preços sempre atualizados.' },
      { icon: 'people-outline', text: 'Clientes e histórico de compras à mão.' },
      { icon: 'stats-chart-outline', text: 'Indicadores do dia em tempo real.' },
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Segurança em primeiro lugar.',
    subtitle: 'Cada acesso respeita a sua empresa, o seu usuário e as suas permissões.',
    features: [
      { icon: 'business-outline', text: 'Dados isolados por empresa.' },
      { icon: 'key-outline', text: 'Sessão protegida no aparelho.' },
      { icon: 'finger-print-outline', text: 'Operações registradas para auditoria.' },
    ],
  },
];

export function OnboardingScreen() {
  const { complete } = useOnboarding();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;

  function next() {
    if (isLast) complete();
    else {
      list.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    }
  }

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.root}>
      <View style={styles.bubble} />
      <SafeAreaView style={styles.root}>
        <FlatList
          ref={list}
          data={slides}
          keyExtractor={(s) => s.title}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <View style={styles.logo}>
                {item.icon === 'brand' ? (
                  <BrandMark size={52} color={colors.onPrimary} />
                ) : (
                  <Icon name={item.icon} size={40} color={colors.onPrimary} />
                )}
              </View>
              <Text variant="display" color="textInverse" style={styles.center}>
                {item.title}
              </Text>
              <Text style={[styles.center, styles.subtitle]}>{item.subtitle}</Text>
              <View style={styles.features}>
                {item.features.map((f) => (
                  <View key={f.text} style={styles.feature}>
                    <Icon name={f.icon} size={26} color={colors.onPrimary} />
                    <Text color="textInverse" style={styles.flex}>
                      {f.text}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        />
        <View style={styles.footer}>
          <View style={styles.dots} accessibilityLabel={`Página ${index + 1} de ${slides.length}`}>
            {slides.map((s, i) => (
              <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <Button label={isLast ? 'Começar' : 'Continuar'} variant="inverse" trailingIcon="arrow-forward" onPress={next} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  bubble: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  slide: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl * 2, alignItems: 'center', gap: spacing.lg },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.overlayBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  center: { textAlign: 'center' },
  subtitle: { color: colors.textInverseMuted, fontSize: 18, lineHeight: 26 },
  features: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.overlayBorder,
  },
  footer: { padding: spacing.xl, gap: spacing.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.overlayBorder },
  dotActive: { width: 10, height: 10, marginTop: -1, backgroundColor: colors.onPrimary },
});
