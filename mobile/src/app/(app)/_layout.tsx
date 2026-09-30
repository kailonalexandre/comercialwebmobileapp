import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/shared/components/icon';
import { colors, fonts, radius, shadow, spacing, typography } from '@/shared/theme/tokens';

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return <Icon name={name} size={24} color={focused ? colors.primary : colors.textMuted} />;
}

const tab = (title: string, icon: IconName, activeIcon: IconName) => ({
  title,
  tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name={focused ? activeIcon : icon} focused={focused} />,
});

export default function AppTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: typography.caption.fontSize - 2 },
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen name="index" options={tab('Início', 'home-outline', 'home')} />
      <Tabs.Screen name="vendas" options={tab('Vendas', 'receipt-outline', 'receipt')} />
      <Tabs.Screen
        name="pdv"
        options={{
          title: 'PDV',
          // Botão central em destaque; o rótulo segue alinhado com os outros itens.
          tabBarIcon: () => (
            <View style={styles.pdvIcon}>
              <View style={styles.pdvButton}>
                <Icon name="barcode-outline" size={28} color={colors.onPrimary} />
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="pedidos" options={tab('Pedidos', 'cube-outline', 'cube')} />
      <Tabs.Screen name="menu" options={tab('Menu', 'grid-outline', 'grid')} />
      {/* Financeiro ainda não tem endpoints no ComercialWeb: fora da barra, a rota segue existindo. */}
      <Tabs.Screen name="financeiro" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { paddingTop: spacing.sm, backgroundColor: colors.background, borderTopColor: colors.border },
  item: { gap: 2 },
  pdvIcon: { width: 56, height: 32, alignItems: 'center' },
  pdvButton: {
    position: 'absolute',
    bottom: 0,
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
});
