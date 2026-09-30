import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatLocal } from '@/features/dashboard/dashboard-model';
import {
  archiveNotification,
  fetchAllNotifications,
  fetchUnreadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/features/notifications/notifications-api';
import { isUnread, markRead, severityLabel, severityTone, type NotificationItem } from '@/features/notifications/notifications-model';
import { ListScreen, type ListControls } from '@/features/shell/list-screen';
import { Icon } from '@/shared/components/icon';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

function Row({ item, controls }: { item: NotificationItem; controls: ListControls<NotificationItem> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const unread = isUnread(item);

  // Otimista: a linha muda na hora; se o servidor recusar, recarrega o estado real.
  function open() {
    if (!unread) return;
    controls.patch((items) => markRead(items, item.id, new Date().toISOString()));
    markNotificationRead(item.id).catch(controls.reload);
  }

  function archive() {
    controls.patch((items) => items.filter((n) => n.id !== item.id));
    archiveNotification(item.id).catch(controls.reload);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Não lida. ' : ''}${item.title}. ${item.body}`}
      onPress={open}
      style={({ pressed }) => [styles.row, unread && styles.unread, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <View style={styles.titleLine}>
          {unread && <View style={styles.dot} />}
          <Text variant="label" style={styles.flex} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        <Text color="textMuted">{item.body}</Text>
        <View style={styles.meta}>
          <StatusPill label={severityLabel(item.severity)} tone={severityTone(item.severity)} />
          {item.createdAt && (
            <Text variant="caption" color="textMuted">
              {formatLocal(item.createdAt)}
            </Text>
          )}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Arquivar" onPress={archive} hitSlop={spacing.sm} style={styles.archive}>
        <Icon name="archive-outline" size={22} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

export function NotificationsScreen() {
  const styles = useStyles();
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Trocar a função de busca (filtro) faz a lista recarregar; "marcar todas" força a troca.
  const [epoch, setEpoch] = useState(0);
  const fetchPage = unreadOnly ? fetchUnreadNotifications : fetchAllNotifications;

  return (
    <ListScreen
      key={`${unreadOnly}-${epoch}`}
      title="Notificações"
      searchPlaceholder="Buscar nas notificações"
      emptyMessage={unreadOnly ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação.'}
      fetchPage={fetchPage}
      keyOf={(n) => String(n.id)}
      onBack={() => router.back()}
      filters={
        <View style={styles.filters}>
          <Chip label="Todas" active={!unreadOnly} onPress={() => setUnreadOnly(false)} />
          <Chip label="Não lidas" active={unreadOnly} onPress={() => setUnreadOnly(true)} />
          <View style={styles.flex} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              markAllNotificationsRead().then(() => setEpoch((n) => n + 1), () => undefined);
            }}
            hitSlop={spacing.md}
          >
            <Text variant="label" color="primary">
              Marcar todas como lidas
            </Text>
          </Pressable>
        </View>
      }
      renderRow={(item, controls) => <Row item={item} controls={controls} />}
    />
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text variant="label" color={active ? 'primary' : 'textMuted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  unread: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.7 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  archive: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
}));
