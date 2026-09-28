import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/shared/components/icon';
import { colors, radius, shadow, spacing, typography } from '@/shared/theme/tokens';

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Icon name={name} size={24} color={focused ? colors.primary : colors.textMuted} />
    </View>
  );
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
        tabBarLabelStyle: { fontSize: typography.caption.fontSize - 1, fontWeight: '600' },
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen name="index" options={tab('Início', 'home-outline', 'home')} />
      <Tabs.Screen name="vendas" options={tab('Vendas', 'cart-outline', 'cart')} />
      <Tabs.Screen
        name="pdv"
        options={{
          title: 'PDV',
          // FAB central como ícone: o rótulo padrão fica alinhado com os outros itens.
          tabBarIcon: () => (
            <View style={styles.pdvIcon}>
              <View style={styles.pdvButton}>
                <Icon name="add" size={32} color={colors.onPrimary} />
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="financeiro" options={tab('Financeiro', 'cash-outline', 'cash')} />
      <Tabs.Screen name="menu" options={tab('Menu', 'menu-outline', 'menu')} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { paddingTop: spacing.sm, backgroundColor: colors.background, borderTopColor: colors.border },
  item: { gap: 2 },
  iconPill: { width: 56, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  iconPillActive: { backgroundColor: colors.primarySoft },
  pdvIcon: { width: 56, height: 32, alignItems: 'center' },
  pdvButton: {
    position: 'absolute',
    bottom: 0,
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
});
