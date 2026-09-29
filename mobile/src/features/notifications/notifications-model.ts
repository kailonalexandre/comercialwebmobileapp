import type { Tone } from '@/shared/theme/tokens';

export type NotificationItem = {
  id: number;
  typeKey: string;
  domain: string;
  severity: string;
  title: string;
  body: string;
  createdAt: string | null; // horário local da empresa, sem fuso
  readAt: string | null;
};

export const isUnread = (n: NotificationItem) => n.readAt === null;

const tones: Record<string, Tone> = { critical: 'danger', warning: 'primary', success: 'success', info: 'info' };
const labels: Record<string, string> = { critical: 'Crítico', warning: 'Atenção', success: 'Sucesso', info: 'Informação' };

// Severidade nova no servidor aparece como veio, em tom neutro.
export const severityTone = (severity: string): Tone => tones[severity] ?? 'primary';
export const severityLabel = (severity: string) => labels[severity] ?? severity;

export const markRead = (items: NotificationItem[], id: number, at: string): NotificationItem[] =>
  items.map((n) => (n.id === id && n.readAt === null ? { ...n, readAt: at } : n));
