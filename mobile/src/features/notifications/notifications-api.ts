import type { NotificationItem } from '@/features/notifications/notifications-model';
import { emitUnreadChanged } from '@/features/shell/unread-events';
import { api } from '@/infrastructure/api';
import type { Paged } from '@/shared/hooks/use-paged-list';

const PAGE_SIZE = 20;

async function fetchPage(page: number, search: string, read?: 'unread'): Promise<Paged<NotificationItem>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    const item: NotificationItem = { id: 1, typeKey: 'vendas.nova', domain: 'vendas', severity: 'info', title: 'Nova venda', body: 'Venda V000024 finalizada', createdAt: '2026-09-29T16:32:00', readAt: null };
    return { items: [item], page: 1, pageSize: PAGE_SIZE, total: 1 };
  }
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) query.set('search', search);
  if (read) query.set('read', read);
  return api.request<Paged<NotificationItem>>(`/v1/notifications?${query.toString()}`);
}

// Identidade estável por filtro: o hook de lista recarrega quando ela muda.
export const fetchAllNotifications = (page: number, search: string) => fetchPage(page, search);
export const fetchUnreadNotifications = (page: number, search: string) => fetchPage(page, search, 'unread');

// Toda mudança de leitura avisa os cabeçalhos para atualizarem o contador do sino.
async function post(path: string) {
  await api?.request(path, { method: 'POST' });
  emitUnreadChanged();
}

export const markNotificationRead = (id: number) => post(`/v1/notifications/${id}/read`);
export const archiveNotification = (id: number) => post(`/v1/notifications/${id}/archive`);
export const markAllNotificationsRead = () => post('/v1/notifications/read-all');
