import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';

type Props = { userName: string; unreadNotifications: number };

// Cabeçalho das telas principais: marca, notificações e avatar.
export function AppHeader({ userName, unreadNotifications }: Props) {
  const badge = unreadNotifications > 9 ? '9+' : String(unreadNotifications);

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <Icon name="cube-outline" size={30} color={colors.primary} />
        <Text variant="heading" color="primary">
          ComercialWeb
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Notificações, ${unreadNotifications} não lidas`}
        onPress={() => Alert.alert('Notificações', 'Em breve.')}
        style={styles.iconButton}
      >
        <Icon name="notifications-outline" size={26} color={colors.text} />
        {unreadNotifications > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Perfil"
        onPress={() => Alert.alert('Perfil', 'Em breve.')}
        style={styles.avatar}
      >
        <Text variant="heading" color="onPrimary">
          {userName.charAt(0).toUpperCase()}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onPrimary, fontSize: 11, lineHeight: 13, fontWeight: '700' },
  avatar: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
