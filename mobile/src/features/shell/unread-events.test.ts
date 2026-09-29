import { emitUnreadChanged, onUnreadChanged } from '@/features/shell/unread-events';

test('avisa quem assinou e para depois de cancelar', () => {
  const listener = jest.fn();
  const off = onUnreadChanged(listener);
  emitUnreadChanged();
  off();
  emitUnreadChanged();
  expect(listener).toHaveBeenCalledTimes(1);
});
