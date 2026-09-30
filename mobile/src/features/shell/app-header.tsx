import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { useUnreadCount } from '@/features/shell/use-unread-count';
import { BrandMark } from '@/shared/components/brand-mark';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { radius, spacing, touchTarget, fonts } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

// Cabeçalho das telas principais: marca, notificações e avatar do usuário da sessão.
export function AppHeader() {
  const styles = useStyles();
  const { colors } = useTheme();
  const userName = useSession().profile?.userName ?? '';
  const unreadNotifications = useUnreadCount();
  const badge = unreadNotifications > 9 ? '9+' : String(unreadNotifications);

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <BrandMark size={34} />
        <Text variant="heading" color="primary">
          Infinit Comercial
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Notificações, ${unreadNotifications} não lidas`}
        onPress={() => router.push('/notificacoes')}
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
        accessibilityLabel={userName ? `Perfil de ${userName}` : 'Perfil'}
        onPress={() => Alert.alert('Perfil', 'Em breve.')}
        style={styles.avatar}
      >
        <Text variant="heading" color="onPrimary">
          {userName.charAt(0).toUpperCase() || '·'}
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  badgeText: { color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 11, lineHeight: 13 },
  avatar: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
