import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useSession } from '@/features/auth/session-context';
import { registerPush } from '@/features/push/register-push';

// Aviso com o app aberto também aparece.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Componente sem UI: registra o push ao entrar e leva a /notificacoes ao tocar no aviso
// (inclusive o toque que abriu o app fechado).
export function PushBridge() {
  const { status } = useSession();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (status === 'signedIn') void registerPush();
  }, [status]);

  useEffect(() => {
    if (status !== 'signedIn' || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    handled.current = id;
    router.push('/notificacoes');
  }, [status, response]);

  return null;
}
