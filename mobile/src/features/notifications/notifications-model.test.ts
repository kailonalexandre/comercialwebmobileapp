import { isUnread, markRead, severityLabel, severityTone, type NotificationItem } from '@/features/notifications/notifications-model';

const n = (id: number, readAt: string | null): NotificationItem => ({
  id, typeKey: 'x', domain: 'vendas', severity: 'info', title: 't', body: 'b', createdAt: null, readAt,
});

test('marca só o aviso pedido e nunca sobrescreve o horário de leitura', () => {
  const items = markRead([n(1, null), n(2, null), n(3, '2026-09-01T10:00:00')], 1, '2026-09-29T14:00:00');
  expect(items.map(isUnread)).toEqual([false, true, false]);
  expect(markRead(items, 3, '2026-09-29T14:00:00')[2]?.readAt).toBe('2026-09-01T10:00:00');
});

test('severidade desconhecida não quebra', () => {
  expect(severityTone('critical')).toBe('danger');
  expect(severityTone('nova')).toBe('primary');
  expect(severityLabel('nova')).toBe('nova');
});
